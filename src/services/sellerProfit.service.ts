import { Op, fn, col, WhereOptions } from 'sequelize';
import { sequelize } from '../config/database';
import { FinancialEvent, Order, OrderItem } from '../models';
import { loadCostLookup, resolveCostFromLookup, CostLookup } from './cost.service';
import { getFinancePnl } from './dashboard.service';
import { getEffectiveFinanceLines } from '../utils/financeEventParser';
import { buildFinanceLineKey } from '../utils/financeDedupe';

export interface SellerProfitFilters {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface UniqueProductRow {
  account_id: string;
  sku: string | null;
  asin: string | null;
  title: string | null;
  main_image: string | null;
  selling_price: number | null;
  currency: string | null;
  product_id: string | null;
  account_name: string | null;
}

interface AsinMetrics {
  sku: string | null;
  unitsSold: number;
  totalRevenue: number;
  totalPurchaseCost: number;
  totalAmazonFees: number;
  actualProfit: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asinKey(accountId: string, asin: string) {
  return `${accountId}:${asin}`;
}

function buildOrderDateFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const filter: Record<symbol, Date> = {};
  if (startDate) filter[Op.gte] = new Date(`${startDate}T00:00:00.000Z`);
  if (endDate) filter[Op.lte] = new Date(`${endDate}T23:59:59.999Z`);
  return filter;
}

function buildEventDateFilter(startDate?: string, endDate?: string) {
  return buildOrderDateFilter(startDate, endDate);
}

function resolveItemPurchaseCost(
  lookup: CostLookup,
  sku: string | null,
  quantity: number,
  storedTotalCost: number,
  storedUnitCost: number,
  purchaseDate: Date | null
): number {
  if (storedTotalCost > 0) return storedTotalCost;
  if (storedUnitCost > 0) return round2(storedUnitCost * quantity);
  const cost = resolveCostFromLookup(lookup, sku, purchaseDate);
  if (cost.found && quantity > 0) return round2(cost.unitCost * quantity);
  return 0;
}

/** Amazon fees + promotions per order (from finance events). */
async function loadAmazonChargesByOrder(filters: SellerProfitFilters): Promise<Map<string, number>> {
  const where: WhereOptions = {
    amazon_order_id: { [Op.ne]: null },
  };
  if (filters.accountId) where.account_id = filters.accountId;
  const dateFilter = buildEventDateFilter(filters.startDate, filters.endDate);
  if (dateFilter) where.posted_date = dateFilter;

  const events = await FinancialEvent.findAll({ where });
  const byOrder = new Map<string, number>();
  const seen = new Set<string>();

  for (const row of events) {
    const plain = row.toJSON() as unknown as Record<string, unknown>;
    const orderId = plain.amazon_order_id as string;
    if (!orderId) continue;

    for (const line of getEffectiveFinanceLines(plain)) {
      if (line.kind !== 'fee' && line.kind !== 'promotion') continue;
      const dedupeKey = buildFinanceLineKey({
        amazon_order_id: orderId,
        event_type: plain.event_type as string,
        fee_type: line.feeType,
        amount: line.amount,
      });
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      byOrder.set(orderId, (byOrder.get(orderId) || 0) + Math.abs(line.amount));
    }
  }

  return byOrder;
}

/**
 * Per-ASIN actual profit from order_items:
 *   Revenue − Amazon fees (allocated per order) − purchase cost (product_costs)
 */
async function buildAsinMetrics(filters: SellerProfitFilters): Promise<Map<string, AsinMetrics>> {
  const metrics = new Map<string, AsinMetrics>();

  const dateFilter = buildOrderDateFilter(filters.startDate, filters.endDate);
  const orderWhere: WhereOptions = {};
  if (filters.accountId) orderWhere.account_id = filters.accountId;
  if (dateFilter) orderWhere.purchase_date = dateFilter;

  const itemWhere: WhereOptions = {
    asin: { [Op.ne]: null },
  };
  if (filters.accountId) itemWhere.account_id = filters.accountId;

  const [feesByOrder, items] = await Promise.all([
    loadAmazonChargesByOrder(filters),
    OrderItem.findAll({
      where: itemWhere,
      attributes: ['id', 'account_id', 'order_id', 'asin', 'sku', 'quantity', 'item_price', 'total_cost', 'unit_cost'],
      include: [
        {
          model: Order,
          as: 'order',
          required: true,
          where: orderWhere,
          attributes: ['amazon_order_id', 'purchase_date', 'order_total'],
        },
      ],
    }),
  ]);

  const orderRevenue = new Map<string, number>();
  const orderUnits = new Map<string, number>();
  for (const item of items) {
    const qty = num(item.quantity) || 1;
    const lineRevenue = num(item.item_price);
    orderRevenue.set(item.order_id, (orderRevenue.get(item.order_id) || 0) + lineRevenue);
    orderUnits.set(item.order_id, (orderUnits.get(item.order_id) || 0) + qty);
  }

  const accountIds = [...new Set(items.map((i) => i.account_id))];
  const lookups = new Map<string, CostLookup>();
  await Promise.all(
    accountIds.map(async (accountId) => {
      lookups.set(accountId, await loadCostLookup(accountId));
    })
  );

  for (const item of items) {
    if (!item.asin) continue;

    const lookup = lookups.get(item.account_id)!;
    const qty = num(item.quantity) || 1;
    const itemWithOrder = item as OrderItem & {
      order?: {
        amazon_order_id?: string | null;
        purchase_date?: Date | null;
        order_total?: number | string | null;
      };
    };
    const directRevenue = num(item.item_price);
    const orderTotalRevenue = num(itemWithOrder.order?.order_total);
    const orderLineRevenue = orderRevenue.get(item.order_id) || 0;
    const orderTotalUnits = orderUnits.get(item.order_id) || 0;
    const revenue =
      directRevenue > 0
        ? directRevenue
        : orderTotalRevenue > 0 && orderTotalUnits > 0
          ? round2(orderTotalRevenue * (qty / orderTotalUnits))
          : 0;
    const purchaseDate = itemWithOrder.order?.purchase_date
      ? new Date(itemWithOrder.order.purchase_date)
      : null;
    const purchaseCost = resolveItemPurchaseCost(
      lookup,
      item.sku,
      qty,
      num(item.total_cost),
      num(item.unit_cost),
      purchaseDate
    );

    const amazonOrderId = itemWithOrder.order?.amazon_order_id || null;
    const orderTotal = orderLineRevenue > 0 ? orderLineRevenue : orderTotalRevenue;
    const orderFees = amazonOrderId ? feesByOrder.get(amazonOrderId) || 0 : 0;
    const allocatedFees = orderTotal > 0 ? round2(orderFees * (revenue / orderTotal)) : 0;

    const actualProfit = round2(revenue - purchaseCost - allocatedFees);

    const key = asinKey(item.account_id, item.asin);
    const existing = metrics.get(key) || {
      sku: item.sku,
      unitsSold: 0,
      totalRevenue: 0,
      totalPurchaseCost: 0,
      totalAmazonFees: 0,
      actualProfit: 0,
    };

    if (!existing.sku && item.sku) existing.sku = item.sku;
    existing.unitsSold += qty;
    existing.totalRevenue = round2(existing.totalRevenue + revenue);
    existing.totalPurchaseCost = round2(existing.totalPurchaseCost + purchaseCost);
    existing.totalAmazonFees = round2(existing.totalAmazonFees + allocatedFees);
    existing.actualProfit = round2(existing.actualProfit + actualProfit);
    metrics.set(key, existing);
  }

  return metrics;
}

async function getUniqueProducts(
  filters: SellerProfitFilters,
  page: number,
  limit: number
): Promise<{ rows: UniqueProductRow[]; total: number }> {
  const accountFilter = filters.accountId ? 'AND oi.account_id = :accountId' : '';
  const dateFilter = filters.startDate || filters.endDate
    ? 'AND o.purchase_date >= :startDate AND o.purchase_date <= :endDate'
    : '';
  const searchFilter = filters.search
    ? `AND (
        oi.sku ILIKE :search OR
        oi.asin ILIKE :search OR
        oi.title ILIKE :search
      )`
    : '';

  const replacements: Record<string, string> = {};
  if (filters.accountId) replacements.accountId = filters.accountId;
  if (filters.search) replacements.search = `%${filters.search}%`;
  if (filters.startDate) replacements.startDate = `${filters.startDate}T00:00:00.000Z`;
  else replacements.startDate = '1970-01-01T00:00:00.000Z';
  if (filters.endDate) replacements.endDate = `${filters.endDate}T23:59:59.999Z`;
  else replacements.endDate = '9999-12-31T23:59:59.999Z';

  const countSql = `
    SELECT COUNT(*) AS total FROM (
      SELECT oi.account_id, oi.asin
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE oi.asin IS NOT NULL
        ${accountFilter}
        ${dateFilter}
        ${searchFilter}
      GROUP BY oi.account_id, oi.asin
    ) uniq
  `;

  const dataSql = `
    SELECT oi.account_id,
      MAX(oi.sku) AS sku,
      oi.asin AS asin,
      MAX(oi.title) AS title,
      NULL::text AS main_image,
      NULL::numeric AS selling_price,
      'INR'::text AS currency,
      NULL::text AS product_id,
      MAX(sa.name) AS account_name
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    LEFT JOIN seller_accounts sa ON sa.id = oi.account_id
    WHERE oi.asin IS NOT NULL
      ${accountFilter}
      ${dateFilter}
      ${searchFilter}
    GROUP BY oi.account_id, oi.asin
    ORDER BY MAX(oi.title) ASC NULLS LAST, oi.asin ASC
    LIMIT :limit OFFSET :offset
  `;

  const [countRows] = await sequelize.query(countSql, { replacements });
  const total = num((countRows as Array<{ total: string }>)[0]?.total);

  const [dataRows] = await sequelize.query(dataSql, {
    replacements: { ...replacements, limit, offset: (page - 1) * limit },
  });

  return { total, rows: dataRows as UniqueProductRow[] };
}

function sumMetrics(metrics: Map<string, AsinMetrics>) {
  let unitsSold = 0;
  let totalRevenue = 0;
  let totalPurchaseCost = 0;
  let totalAmazonFees = 0;
  let totalActualProfit = 0;

  for (const m of metrics.values()) {
    unitsSold += m.unitsSold;
    totalRevenue += m.totalRevenue;
    totalPurchaseCost += m.totalPurchaseCost;
    totalAmazonFees += m.totalAmazonFees;
    totalActualProfit += m.actualProfit;
  }

  return {
    unitsSold,
    totalRevenue: round2(totalRevenue),
    totalPurchaseCost: round2(totalPurchaseCost),
    totalAmazonFees: round2(totalAmazonFees),
    totalActualProfit: round2(totalActualProfit),
  };
}

export async function getSellerProfit(filters: SellerProfitFilters) {
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 100);

  const [asinMetrics, { rows: uniqueProducts, total: count }, financePnl] = await Promise.all([
    buildAsinMetrics(filters),
    getUniqueProducts(filters, page, limit),
    getFinancePnl(filters),
  ]);

  const accountIds = [...new Set(uniqueProducts.map((p) => p.account_id))];
  const lookups = new Map<string, CostLookup>();
  for (const accountId of accountIds) {
    lookups.set(accountId, await loadCostLookup(accountId));
  }

  const data = uniqueProducts.map((product) => {
    if (!product.asin) return null;
    const key = asinKey(product.account_id, product.asin);
    const sales = asinMetrics.get(key);
    const effectiveSku = product.sku || sales?.sku || null;
    const lookup = lookups.get(product.account_id)!;
    const cost = resolveCostFromLookup(lookup, effectiveSku);
    const listingPrice = num(product.selling_price);

    const unitsSold = sales?.unitsSold ?? 0;
    const totalRevenue = sales?.totalRevenue ?? 0;
    const totalPurchaseCost = sales?.totalPurchaseCost ?? 0;
    const totalAmazonFees = sales?.totalAmazonFees ?? 0;
    const actualProfit = sales?.actualProfit ?? null;
    const purchaseCostPerUnit =
      unitsSold > 0 && totalPurchaseCost > 0
        ? round2(totalPurchaseCost / unitsSold)
        : cost.found
          ? round2(cost.unitCost)
          : null;

    const avgSellingPrice =
      unitsSold > 0 ? round2(totalRevenue / unitsSold) : listingPrice > 0 ? listingPrice : null;

    const actualProfitPerUnit =
      unitsSold > 0 && actualProfit != null
        ? round2(actualProfit / unitsSold)
        : avgSellingPrice != null && purchaseCostPerUnit != null
          ? round2(avgSellingPrice - purchaseCostPerUnit)
          : null;

    const marginPct =
      totalRevenue > 0 && actualProfit != null
        ? round2((actualProfit / totalRevenue) * 100)
        : null;

    return {
      id: product.product_id || `${product.account_id}-${product.sku}`,
      account_id: product.account_id,
      sku: effectiveSku,
      asin: product.asin,
      title: product.title,
      main_image: product.main_image,
      currency: product.currency || cost.currency || 'INR',
      listingPrice: listingPrice > 0 ? listingPrice : null,
      purchaseCostPerUnit,
      hasCost: purchaseCostPerUnit != null,
      avgSellingPrice,
      unitsSold,
      totalRevenue: round2(totalRevenue),
      totalPurchaseCost: round2(totalPurchaseCost),
      totalAmazonFees: round2(totalAmazonFees),
      actualProfit,
      actualProfitPerUnit,
      marginPct,
      account: product.account_name ? { name: product.account_name } : undefined,
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const summaryTotals = sumMetrics(asinMetrics);

  const allUnique = await getUniqueProducts(filters, 1, 100000);
  const allAccountIds = [...new Set(allUnique.rows.map((p) => p.account_id))];
  const allLookups = new Map<string, CostLookup>();
  for (const accountId of allAccountIds) {
    allLookups.set(accountId, await loadCostLookup(accountId));
  }
  const productsWithCost = allUnique.rows.filter((p) => {
    const lookup = allLookups.get(p.account_id);
    return lookup && resolveCostFromLookup(lookup, p.sku).found;
  }).length;

  return {
    currency: 'INR',
    summary: {
      totalProducts: count,
      unitsSold: summaryTotals.unitsSold,
      totalRevenue: summaryTotals.totalRevenue,
      totalPurchaseCost: summaryTotals.totalPurchaseCost,
      totalAmazonFees: summaryTotals.totalAmazonFees,
      totalActualProfit: summaryTotals.totalActualProfit,
      netProfit: financePnl.netProfit,
      productsWithCost,
      hasFinanceData: financePnl.hasFinanceData,
    },
    data,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}
