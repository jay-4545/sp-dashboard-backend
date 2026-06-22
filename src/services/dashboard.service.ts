import { Op, fn, col, WhereOptions } from 'sequelize';
import {
  SellerAccount,
  Order,
  OrderItem,
  InventorySnapshot,
  FinancialEvent,
  SyncJob,
} from '../models';

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

  return { data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}

export async function getFinancePnl(filters: DashboardFilters) {
  const where: WhereOptions = {};
  if (filters.accountId) where.account_id = filters.accountId;
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate);
  if (dateFilter) where.posted_date = dateFilter;

  const events = await FinancialEvent.findAll({
    where,
    attributes: [
      'event_type',
      'fee_type',
      [fn('COALESCE', fn('SUM', col('amount')), 0), 'total'],
      'currency',
    ],
    group: ['event_type', 'fee_type', 'currency'],
    raw: true,
  });

  const totalRevenue = await Order.sum('order_total', {
    where: filters.accountId ? { account_id: filters.accountId } : {},
  });

  return {
    totalRevenue: totalRevenue || 0,
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
