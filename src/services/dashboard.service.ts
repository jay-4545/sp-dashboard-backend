import { Op, fn, col, WhereOptions } from 'sequelize';
import {
  SellerAccount,
  Order,
  OrderItem,
  InventorySnapshot,
  FinancialEvent,
  SyncJob,
} from '../models';
import { enrichFinancialEventRecord, getEffectiveFinanceLines } from '../utils/financeEventParser';
import { buildFinanceLineKey } from '../utils/financeDedupe';

export interface DashboardFilters {
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

function buildDateFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const filter: Record<symbol, Date> = {};
  if (startDate) {
    filter[Op.gte] = new Date(`${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    // Inclusive end date — `new Date('YYYY-MM-DD')` is midnight, which excludes same-day orders
    filter[Op.lte] = new Date(`${endDate}T23:59:59.999Z`);
  }
  return filter;
}

export async function getDashboardSummary(filters: DashboardFilters) {
  const orderWhere: WhereOptions = {};
  if (filters.accountId) orderWhere.account_id = filters.accountId;
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (dateFilter) orderWhere.purchase_date = dateFilter;

  const [orderStats, accountBreakdown, topSkus, revenueByDay] = await Promise.all([
    Order.findOne({
      where: orderWhere,
      attributes: [
        [fn('COUNT', col('id')), 'totalOrders'],
        [fn('COALESCE', fn('SUM', col('order_total')), 0), 'totalRevenue'],
      ],
      raw: true,
    }),
    Order.findAll({
      where: orderWhere,
      attributes: [
        'account_id',
        [fn('COUNT', col('Order.id')), 'orderCount'],
        [fn('COALESCE', fn('SUM', col('order_total')), 0), 'revenue'],
      ],
      include: [{ model: SellerAccount, as: 'account', attributes: ['name'] }],
      group: ['account_id', 'account.id', 'account.name'],
      raw: true,
    }),
    OrderItem.findAll({
      where: filters.accountId ? { account_id: filters.accountId } : {},
      attributes: [
        'sku',
        'asin',
        [fn('SUM', col('quantity')), 'totalQty'],
        [fn('SUM', col('item_price')), 'totalRevenue'],
      ],
      group: ['sku', 'asin'],
      order: [[fn('SUM', col('item_price')), 'DESC']],
      limit: 10,
      raw: true,
    }),
    Order.findAll({
      where: orderWhere,
      attributes: [
        [fn('DATE', col('purchase_date')), 'date'],
        [fn('COALESCE', fn('SUM', col('order_total')), 0), 'revenue'],
        [fn('COUNT', col('id')), 'orders'],
      ],
      group: [fn('DATE', col('purchase_date'))],
      order: [[fn('DATE', col('purchase_date')), 'ASC']],
      raw: true,
    }),
  ]);

  const stats = orderStats as unknown as { totalOrders: string; totalRevenue: string };

  return {
    totalOrders: parseInt(stats?.totalOrders || '0', 10),
    totalRevenue: parseFloat(stats?.totalRevenue || '0'),
    accountBreakdown,
    topSkus,
    revenueByDay,
  };
}

export interface OrdersQuery {
  accountId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export async function getOrders(query: OrdersQuery) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const offset = (page - 1) * limit;

  const where: WhereOptions = {};
  if (query.accountId) where.account_id = query.accountId;
  if (query.status) where.status = query.status;
  const dateFilter = buildDateFilter(query.startDate, query.endDate);
  if (dateFilter) where.purchase_date = dateFilter;

  if (query.search) {
    const term = `%${query.search}%`;
    const itemWhere: WhereOptions = {
      [Op.or]: [
        { sku: { [Op.iLike]: term } },
        { asin: { [Op.iLike]: term } },
      ],
    };
    if (query.accountId) itemWhere.account_id = query.accountId;

    const matchingItems = await OrderItem.findAll({
      attributes: ['order_id'],
      where: itemWhere,
      group: ['order_id'],
      raw: true,
    });
    const orderIdsFromItems = matchingItems.map(
      (row) => (row as { order_id: string }).order_id
    );

    const searchConditions: WhereOptions[] = [
      { amazon_order_id: { [Op.iLike]: term } },
    ];
    if (orderIdsFromItems.length > 0) {
      searchConditions.push({ id: { [Op.in]: orderIdsFromItems } });
    }
    where[Op.or] = searchConditions;
  }

  const count = await Order.count({ where });

  const rows = await Order.findAll({
    where,
    include: [
      { model: SellerAccount, as: 'account', attributes: ['name'] },
      { model: OrderItem, as: 'items', attributes: ['sku', 'asin', 'title', 'quantity', 'item_price'] },
    ],
    order: [['purchase_date', 'DESC']],
    limit,
    offset,
  });

  return { data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export interface InventoryQuery {
  accountId?: string;
  lowStock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getInventory(query: InventoryQuery) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const offset = (page - 1) * limit;

  const where: WhereOptions = {};
  if (query.accountId) where.account_id = query.accountId;
  if (query.lowStock) where.sellable_qty = { [Op.lt]: 10 };
  if (query.search) {
    const term = `%${query.search}%`;
    where[Op.or] = [
      { sku: { [Op.iLike]: term } },
      { asin: { [Op.iLike]: term } },
      { fnsku: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await InventorySnapshot.findAndCountAll({
    where,
    include: [{ model: SellerAccount, as: 'account', attributes: ['name'] }],
    order: [['snapshotted_at', 'DESC']],
    limit,
    offset,
  });

  return { data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export interface FinanceEventsQuery {
  accountId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export async function getFinanceEvents(query: FinanceEventsQuery) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const offset = (page - 1) * limit;

  const where: WhereOptions = {};
  if (query.accountId) where.account_id = query.accountId;
  const dateFilter = buildDateFilter(query.startDate, query.endDate);
  if (dateFilter) where.posted_date = dateFilter;
  if (query.search) {
    const term = `%${query.search}%`;
    where[Op.or] = [
      { amazon_order_id: { [Op.iLike]: term } },
      { event_type: { [Op.iLike]: term } },
      { fee_type: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await FinancialEvent.findAndCountAll({
    where,
    include: [{ model: SellerAccount, as: 'account', attributes: ['name'] }],
    order: [['posted_date', 'DESC']],
    limit,
    offset,
  });

  return {
    data: rows.map((row) => enrichFinancialEventRecord(row.toJSON())),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}

export async function getFinancePnl(filters: DashboardFilters) {
  const orderWhere: WhereOptions = {};
  if (filters.accountId) orderWhere.account_id = filters.accountId;
  const orderDateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (orderDateFilter) orderWhere.purchase_date = orderDateFilter;

  const eventWhere: WhereOptions = {};
  if (filters.accountId) eventWhere.account_id = filters.accountId;
  const eventDateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (eventDateFilter) eventWhere.posted_date = eventDateFilter;

  const [totalRevenueRaw, eventRows] = await Promise.all([
    Order.sum('order_total', { where: orderWhere }),
    FinancialEvent.findAll({ where: eventWhere }),
  ]);

  const breakdownMap = new Map<
    string,
    { event_type: string; fee_type: string; kind: string; total: number; currency: string }
  >();
  const seenLines = new Set<string>();

  let feeTotal = 0;        // Amazon fees (negative)
  let promotionTotal = 0;  // seller-funded promos (negative)
  let refundTotal = 0;     // buyer refunds (negative)
  let taxTotal = 0;        // taxes (informational)
  let uniqueLineCount = 0;
  let currency = 'INR';

  for (const row of eventRows) {
    const plain = row.toJSON();
    const lines = getEffectiveFinanceLines(plain);

    for (const line of lines) {
      const dedupeKey = buildFinanceLineKey({
        amazon_order_id: plain.amazon_order_id,
        event_type: plain.event_type,
        fee_type: line.feeType,
        amount: line.amount,
      });

      if (seenLines.has(dedupeKey)) continue;
      seenLines.add(dedupeKey);

      uniqueLineCount++;
      currency = line.currency || currency;

      // Bucket by kind. Revenue lines are SKIPPED here because the sale
      // revenue already comes from Order.sum('order_total') — counting
      // Principal again would double-count the sale.
      switch (line.kind) {
        case 'fee':
          feeTotal += line.amount;
          break;
        case 'promotion':
          promotionTotal += line.amount;
          break;
        case 'refund':
          refundTotal += line.amount;
          break;
        case 'tax':
          taxTotal += line.amount;
          break;
        case 'revenue':
        default:
          break;
      }

      const breakdownKey = `${plain.event_type || 'unknown'}|${line.feeType || ''}|${line.kind}`;
      const existing = breakdownMap.get(breakdownKey);
      if (existing) {
        existing.total += line.amount;
      } else {
        breakdownMap.set(breakdownKey, {
          event_type: plain.event_type || 'unknown',
          fee_type: line.feeType || '',
          kind: line.kind,
          total: line.amount,
          currency: line.currency,
        });
      }
    }
  }

  const totalRevenue = parseFloat(String(totalRevenueRaw || 0));

  // Bucket totals are stored as negative magnitudes; flip to positive for display.
  const totalFees = Math.abs(feeTotal);
  const totalPromotions = Math.abs(promotionTotal);
  const totalRefunds = Math.abs(refundTotal);
  const totalTax = Math.abs(taxTotal);

  const hasFinanceData = uniqueLineCount > 0;

  // Net = order revenue minus everything Amazon/buyer took back.
  // (Add `- COGS` here once you store product cost per SKU for TRUE profit.)
  const netProfit = hasFinanceData
    ? totalRevenue + feeTotal + promotionTotal + refundTotal
    : totalRevenue;

  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

  const eventCount = uniqueLineCount;
  const events = Array.from(breakdownMap.values())
    .map((entry) => ({ ...entry, total: String(entry.total) }))
    .sort((a, b) => Math.abs(parseFloat(b.total)) - Math.abs(parseFloat(a.total)));

  return {
    totalRevenue,
    totalFees,
    totalPromotions,
    totalRefunds,
    totalTax,
    netProfit,
    margin,
    eventCount,
    hasFinanceData,
    currency,
    events,
  };
}

export async function getSyncStatus(accountId?: string) {
  const where: WhereOptions = accountId ? { account_id: accountId } : {};

  const jobs = await SyncJob.findAll({
    where,
    include: [{ model: SellerAccount, as: 'account', attributes: ['name'] }],
    order: [['started_at', 'DESC']],
    limit: 50,
  });

  const latestByType = await SyncJob.findAll({
    where,
    attributes: [
      'account_id',
      'sync_type',
      [fn('MAX', col('started_at')), 'lastStarted'],
    ],
    group: ['account_id', 'sync_type'],
    raw: true,
  });

  return { recentJobs: jobs, latestByType };
}