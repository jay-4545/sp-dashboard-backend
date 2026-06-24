import { Op, fn, col, WhereOptions } from 'sequelize';
import {
  SellerAccount,
  Order,
  OrderItem,
  InventorySnapshot,
  FinancialEvent,
  Product,
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
  if (startDate) filter[Op.gte] = new Date(`${startDate}T00:00:00.000Z`);
  if (endDate) filter[Op.lte] = new Date(`${endDate}T23:59:59.999Z`);
  return filter;
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/* ------------------------------------------------------------------ */
/* DASHBOARD SUMMARY                                                   */
/* ------------------------------------------------------------------ */

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
        [fn('COALESCE', fn('SUM', col('cogs_lost')), 0), 'totalCogsLost'],
        [fn('COALESCE', fn('SUM', col('refund_amount')), 0), 'totalRefunds'],
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
      where: {
        ...(filters.accountId ? { account_id: filters.accountId } : {}),
        asin: { [Op.ne]: null },
      },
      attributes: [
        [fn('MAX', col('OrderItem.sku')), 'sku'],
        'asin',
        [fn('SUM', col('quantity')), 'totalQty'],
        [fn('SUM', col('item_price')), 'totalRevenue'],
        [fn('COALESCE', fn('SUM', col('total_cost')), 0), 'totalCost'],
      ],
      include: [
        {
          model: Order,
          as: 'order',
          required: true,
          where: orderWhere,
          attributes: [],
        },
      ],
      group: ['asin'],
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

  const stats = orderStats as unknown as {
    totalOrders: string;
    totalRevenue: string;
    totalCogsLost: string;
    totalRefunds: string;
  };

  return {
    totalOrders: parseInt(stats?.totalOrders || '0', 10),
    totalRevenue: num(stats?.totalRevenue),
    totalCogsLost: num(stats?.totalCogsLost),
    totalRefunds: num(stats?.totalRefunds),
    currency: 'INR',
    accountBreakdown,
    topSkus: (topSkus as unknown as Array<Record<string, unknown>>).map((r) => ({
      sku: r.sku,
      asin: r.asin,
      totalQty: num(r.totalQty),
      totalRevenue: num(r.totalRevenue),
      totalCost: num(r.totalCost),
      grossProfit: num(r.totalRevenue) - num(r.totalCost),
    })),
    revenueByDay,
  };
}

/* ------------------------------------------------------------------ */
/* ORDERS                                                              */
/* ------------------------------------------------------------------ */

export interface OrdersQuery {
  accountId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  refundedOnly?: boolean;
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
  if (query.refundedOnly) where.is_refunded = true;
  const dateFilter = buildDateFilter(query.startDate, query.endDate);
  if (dateFilter) where.purchase_date = dateFilter;

  if (query.search) {
    const term = `%${query.search}%`;
    const itemWhere: Record<string | symbol, unknown> = {
      [Op.or]: [{ sku: { [Op.iLike]: term } }, { asin: { [Op.iLike]: term } }],
    };
    if (query.accountId) itemWhere.account_id = query.accountId;

    const matchingItems = await OrderItem.findAll({
      attributes: ['order_id'],
      where: itemWhere as WhereOptions,
      group: ['order_id'],
      raw: true,
    });
    const orderIdsFromItems = matchingItems.map((row) => (row as { order_id: string }).order_id);

    const searchConditions: WhereOptions[] = [{ amazon_order_id: { [Op.iLike]: term } }];
    if (orderIdsFromItems.length > 0) {
      searchConditions.push({ id: { [Op.in]: orderIdsFromItems } });
    }
    (where as Record<symbol, unknown>)[Op.or] = searchConditions;
  }

  const count = await Order.count({ where });

  const rows = await Order.findAll({
    where,
    include: [
      { model: SellerAccount, as: 'account', attributes: ['name'] },
      {
        model: OrderItem,
        as: 'items',
        attributes: [
          'sku',
          'asin',
          'title',
          'quantity',
          'item_price',
          'unit_cost',
          'total_cost',
          'is_returned',
        ],
      },
    ],
    order: [['purchase_date', 'DESC']],
    limit,
    offset,
  });

  // Har order mate revenue, cost, fee-share vagar nu gross profit attach karo.
  const data = rows.map((row) => {
    const o = row.toJSON() as unknown as Record<string, unknown>;
    const items = (o.items as Array<Record<string, unknown>>) || [];
    const itemRevenue = items.reduce((s, it) => s + num(it.item_price) * (num(it.quantity) || 1), 0);
    const itemCost = items.reduce((s, it) => s + num(it.total_cost), 0);
    const orderRevenue = num(o.order_total) || itemRevenue;

    return {
      ...o,
      computed: {
        revenue: orderRevenue,
        cost: itemCost,
        refund: num(o.refund_amount),
        cogsLost: num(o.cogs_lost),
        // Gross profit = revenue − COGS − refund − COGS lost on returns.
        grossProfit: orderRevenue - itemCost - num(o.refund_amount) - num(o.cogs_lost),
      },
    };
  });

  return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

/* ------------------------------------------------------------------ */
/* INVENTORY                                                           */
/* ------------------------------------------------------------------ */

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
    (where as Record<symbol, unknown>)[Op.or] = [
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

/* ------------------------------------------------------------------ */
/* FINANCE EVENTS                                                      */
/* ------------------------------------------------------------------ */

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
    (where as Record<symbol, unknown>)[Op.or] = [
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

/* ------------------------------------------------------------------ */
/* PROFIT & LOSS  — 100% breakdown including COGS + return cost        */
/* ------------------------------------------------------------------ */

export async function getFinancePnl(filters: DashboardFilters) {
  const orderWhere: WhereOptions = {};
  if (filters.accountId) orderWhere.account_id = filters.accountId;
  const orderDateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (orderDateFilter) orderWhere.purchase_date = orderDateFilter;

  const eventWhere: WhereOptions = {};
  if (filters.accountId) eventWhere.account_id = filters.accountId;
  const eventDateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (eventDateFilter) eventWhere.posted_date = eventDateFilter;

  const [orderAgg, cogsAgg, eventRows] = await Promise.all([
    // Sale revenue + booked refunds + COGS lost on returns come from orders.
    Order.findOne({
      where: orderWhere,
      attributes: [
        [fn('COALESCE', fn('SUM', col('order_total')), 0), 'revenue'],
        [fn('COALESCE', fn('SUM', col('refund_amount')), 0), 'refunds'],
        [fn('COALESCE', fn('SUM', col('cogs_lost')), 0), 'cogsLost'],
        [fn('COUNT', col('id')), 'orderCount'],
      ],
      raw: true,
    }),
    // COGS of everything sold (item-level snapshot).
    OrderItem.findOne({
      where: filters.accountId ? { account_id: filters.accountId } : {},
      attributes: [[fn('COALESCE', fn('SUM', col('total_cost')), 0), 'cogs']],
      include: orderDateFilter
        ? [{ model: Order, as: 'order', attributes: [], where: { purchase_date: orderDateFilter }, required: true }]
        : [],
      raw: true,
    }),
    FinancialEvent.findAll({ where: eventWhere }),
  ]);

  const orderStats = orderAgg as unknown as {
    revenue: string;
    refunds: string;
    cogsLost: string;
    orderCount: string;
  };
  const cogsStats = cogsAgg as unknown as { cogs: string };

  // ---- Walk financial events for fees / promotions / tax / extra refunds ----
  const breakdownMap = new Map<
    string,
    { event_type: string; fee_type: string; kind: string; total: number; currency: string }
  >();
  const seenLines = new Set<string>();

  let feeTotal = 0;        // Amazon fees (negative)
  let promotionTotal = 0;  // seller-funded promos (negative)
  let refundEventTotal = 0;// refund lines from finance events (negative)
  let taxTotal = 0;        // taxes / TCS (informational)
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

      switch (line.kind) {
        case 'fee':
          feeTotal += line.amount;
          break;
        case 'promotion':
          promotionTotal += line.amount;
          break;
        case 'refund':
          refundEventTotal += line.amount;
          break;
        case 'tax':
          taxTotal += line.amount;
          break;
        case 'revenue':
        default:
          // Sale revenue Order.sum mathi aave che — double-count na karvu.
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

  const totalRevenue = num(orderStats?.revenue);
  const totalCogs = num(cogsStats?.cogs);
  const cogsLostOnReturns = num(orderStats?.cogsLost);

  const totalFees = Math.abs(feeTotal);
  const totalPromotions = Math.abs(promotionTotal);
  const totalTax = Math.abs(taxTotal);

  // Refunds: order-level booked refunds preferred; nahi to finance events.
  const orderRefunds = num(orderStats?.refunds);
  const totalRefunds = orderRefunds > 0 ? orderRefunds : Math.abs(refundEventTotal);

  const hasFinanceData = uniqueLineCount > 0;

  // ----------------------- FINAL P&L -----------------------
  // Gross profit  = Revenue − COGS
  // Net profit    = Gross − Amazon fees − Promotions − Refunds − COGS lost on returns
  const grossProfit = totalRevenue - totalCogs;
  const netProfit =
    grossProfit - totalFees - totalPromotions - totalRefunds - cogsLostOnReturns;

  const grossMargin = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;
  const netMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;

  const events = Array.from(breakdownMap.values())
    .map((entry) => ({ ...entry, total: round2(entry.total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return {
    currency,
    orderCount: parseInt(orderStats?.orderCount || '0', 10),
    // Revenue side
    totalRevenue: round2(totalRevenue),
    // Cost side (all positive magnitudes for display)
    totalCogs: round2(totalCogs),
    cogsLostOnReturns: round2(cogsLostOnReturns),
    totalFees: round2(totalFees),
    totalPromotions: round2(totalPromotions),
    totalRefunds: round2(totalRefunds),
    totalTax: round2(totalTax),
    // Profit
    grossProfit: round2(grossProfit),
    netProfit: round2(netProfit),
    grossMargin,
    netMargin,
    // Meta
    eventCount: uniqueLineCount,
    hasFinanceData,
    events,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* SYNC STATUS                                                         */
/* ------------------------------------------------------------------ */

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
    attributes: ['account_id', 'sync_type', [fn('MAX', col('started_at')), 'lastStarted']],
    group: ['account_id', 'sync_type'],
    raw: true,
  });

  return { recentJobs: jobs, latestByType };
}