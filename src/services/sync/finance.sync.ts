import { Op } from 'sequelize';
import { SellerAccount, Order, OrderItem, FinancialEvent } from '../../models';
import { fetchFinancialEvents } from '../amazon/finance.service';
import { expandFinancialEvent, getEffectiveFinanceLines } from '../../utils/financeEventParser';
import { buildFinanceLineKey } from '../../utils/financeDedupe';
import { dedupeFinancialEvents, cleanupNullAmountDuplicates } from '../../utils/financeDedupe';

/**
 * Performance-optimized finance sync (India-only).
 *
 * Pipeline:
 *   1. Cleanup juna duplicates / null amounts.
 *   2. Amazon thi events fetch karo, parse + in-memory dedupe.
 *   3. Nava rows bulkCreate.
 *   4. NAVU: refunds ne order par roll-up karo — is_refunded, refund_amount,
 *      ane cogs_lost (return thi gumayeli product cost) set thay.
 */

const EPOCH_DATE = new Date('1970-01-01T00:00:00.000Z');
const INSERT_BATCH_SIZE = 1000;

interface PendingEvent {
  account_id: string;
  amazon_order_id: string | null;
  event_type: string;
  amount: number | null;
  currency: string;
  fee_type: string | null;
  posted_date: Date;
  raw_data: Record<string, unknown>;
}

export async function syncFinanceForAccount(account: SellerAccount): Promise<number> {
  const cleaned = await cleanupNullAmountDuplicates(account.id);
  const deduped = await dedupeFinancialEvents(account.id);
  const backfilled = await backfillNullAmounts(account.id);

  const orderDateCache = await loadOrderDateCache(account.id);
  const datesFixed = await fixEpochPostedDates(account.id, orderDateCache);

  const existingKeys = await loadExistingEventKeys(account.id);

  const postedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await fetchFinancialEvents(account, postedAfter);

  const toInsert: PendingEvent[] = [];
  const seenInThisRun = new Set<string>();

  for (const event of events) {
    const eventType = (event.eventType as string) || 'unknown';
    const amazonOrderId = (event.AmazonOrderId as string) || null;
    const postedDate = resolvePostedDate(event, amazonOrderId, orderDateCache);
    const lines = expandFinancialEvent(event);

    if (lines.length === 0) {
      queueIfNew(toInsert, existingKeys, seenInThisRun, {
        account_id: account.id,
        amazon_order_id: amazonOrderId,
        event_type: eventType,
        amount: null,
        currency: 'INR',
        fee_type: null,
        posted_date: postedDate,
        raw_data: event,
      });
      continue;
    }

    for (const line of lines) {
      queueIfNew(toInsert, existingKeys, seenInThisRun, {
        account_id: account.id,
        amazon_order_id: amazonOrderId,
        event_type: eventType,
        amount: line.amount,
        currency: line.currency,
        fee_type: line.feeType,
        posted_date: postedDate,
        raw_data: event,
      });
    }
  }

  let synced = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    await FinancialEvent.bulkCreate(batch, { ignoreDuplicates: true });
    synced += batch.length;
  }

  const dedupedAfter = await dedupeFinancialEvents(account.id);

  // NAVU: refunds ne order par roll-up karo.
  const ordersUpdated = await rollupRefundsToOrders(account.id);

  return synced + backfilled + cleaned + deduped + dedupedAfter + datesFixed + ordersUpdated;
}

/* ---------------- Refund roll-up: order par return cost set ---------------- */

/**
 * Har refund event ne tena order par aggregate kare:
 *   - refund_amount = kul buyer ne pacha aapeli principal (positive magnitude).
 *   - is_refunded   = true.
 *   - cogs_lost     = aa order na returned items no COGS (product pacho na
 *     vechay sake to loss). Aapne conservatively full COGS loss ganie chie.
 *     Jo product restock thay to aagal `restockOrderItems()` thi adjust karaay.
 */
async function rollupRefundsToOrders(accountId: string): Promise<number> {
  // 1. Badha refund-kind lines ne order-wise total karo.
  const refundRows = await FinancialEvent.findAll({
    where: {
      account_id: accountId,
      amazon_order_id: { [Op.ne]: null },
      event_type: { [Op.iLike]: '%refund%' },
    },
  });

  const refundByOrder = new Map<string, number>();
  const seen = new Set<string>();

  for (const row of refundRows) {
    const plain = row.toJSON();
    const lines = getEffectiveFinanceLines(plain);
    for (const line of lines) {
      if (line.kind !== 'refund') continue;
      const key = buildFinanceLineKey({
        amazon_order_id: plain.amazon_order_id,
        event_type: plain.event_type,
        fee_type: line.feeType,
        amount: line.amount,
      });
      if (seen.has(key)) continue;
      seen.add(key);

      const oid = plain.amazon_order_id as string;
      // Principal refunds negative aave che; positive magnitude store karo.
      refundByOrder.set(oid, (refundByOrder.get(oid) || 0) + Math.abs(line.amount));
    }
  }

  if (refundByOrder.size === 0) return 0;

  // 2. Te orders ane temna items load karo (COGS mate).
  const orderIds = [...refundByOrder.keys()];
  const orders = await Order.findAll({
    where: { account_id: accountId, amazon_order_id: { [Op.in]: orderIds } },
    include: [{ model: OrderItem, as: 'items', attributes: ['quantity', 'total_cost'] }],
  });

  let updated = 0;
  for (const order of orders) {
    const refundAmount = round2(refundByOrder.get(order.amazon_order_id) || 0);
    if (refundAmount <= 0) continue;

    const items = (order.get('items') as OrderItem[] | undefined) || [];
    const cogsLost = round2(items.reduce((s, it) => s + Number(it.total_cost || 0), 0));

    await order.update({
      is_refunded: true,
      refund_amount: refundAmount,
      cogs_lost: cogsLost,
    });

    // Items ne returned mark karo.
    await OrderItem.update(
      { is_returned: true },
      { where: { order_id: order.id } }
    );

    updated++;
  }

  return updated;
}

/**
 * Jo koi return product fari sellable thay (restock), to e order no COGS loss
 * recover thaay che. Aa manual/optional helper che — UI mathi call karaay.
 */
export async function markOrderRestocked(orderId: string): Promise<void> {
  await Order.update({ cogs_lost: 0 }, { where: { id: orderId } });
}

/* ---------------- existing helpers ---------------- */

function queueIfNew(
  toInsert: PendingEvent[],
  existingKeys: Set<string>,
  seenInThisRun: Set<string>,
  data: PendingEvent
): void {
  const key = buildFinanceLineKey({
    amazon_order_id: data.amazon_order_id,
    event_type: data.event_type,
    fee_type: data.fee_type,
    amount: data.amount,
  });
  if (existingKeys.has(key) || seenInThisRun.has(key)) return;
  seenInThisRun.add(key);
  toInsert.push(data);
}

async function loadExistingEventKeys(accountId: string): Promise<Set<string>> {
  const rows = await FinancialEvent.findAll({
    where: { account_id: accountId },
    attributes: ['amazon_order_id', 'event_type', 'fee_type', 'amount'],
    raw: true,
  });

  const keys = new Set<string>();
  for (const row of rows as unknown as Array<{
    amazon_order_id: string | null;
    event_type: string | null;
    fee_type: string | null;
    amount: number | string | null;
  }>) {
    keys.add(
      buildFinanceLineKey({
        amazon_order_id: row.amazon_order_id,
        event_type: row.event_type,
        fee_type: row.fee_type,
        amount: row.amount,
      })
    );
  }
  return keys;
}

async function loadOrderDateCache(accountId: string): Promise<Map<string, Date>> {
  const orders = await Order.findAll({
    where: { account_id: accountId },
    attributes: ['amazon_order_id', 'purchase_date'],
    raw: true,
  });

  const cache = new Map<string, Date>();
  for (const order of orders as unknown as Array<{
    amazon_order_id: string;
    purchase_date: Date | null;
  }>) {
    if (order.purchase_date) cache.set(order.amazon_order_id, order.purchase_date);
  }
  return cache;
}

async function fixEpochPostedDates(
  accountId: string,
  orderDateCache: Map<string, Date>
): Promise<number> {
  const rows = await FinancialEvent.findAll({
    where: { account_id: accountId, posted_date: EPOCH_DATE },
  });

  const updatesByDate = new Map<number, string[]>();
  for (const row of rows) {
    if (!row.amazon_order_id) continue;
    const orderDate = orderDateCache.get(row.amazon_order_id);
    if (!orderDate) continue;
    const t = orderDate.getTime();
    if (!updatesByDate.has(t)) updatesByDate.set(t, []);
    updatesByDate.get(t)!.push(row.id);
  }

  let fixed = 0;
  for (const [time, ids] of updatesByDate.entries()) {
    const [count] = await FinancialEvent.update(
      { posted_date: new Date(time) },
      { where: { id: { [Op.in]: ids } } }
    );
    fixed += count;
  }
  return fixed;
}

function resolvePostedDate(
  event: Record<string, unknown>,
  amazonOrderId: string | null,
  orderDateCache: Map<string, Date>
): Date {
  if (event.PostedDate) return new Date(event.PostedDate as string);
  if (amazonOrderId && orderDateCache.has(amazonOrderId)) {
    return orderDateCache.get(amazonOrderId)!;
  }
  return EPOCH_DATE;
}

async function backfillNullAmounts(accountId: string): Promise<number> {
  const rows = await FinancialEvent.findAll({
    where: { account_id: accountId, amount: null },
  });

  let fixed = 0;
  for (const row of rows) {
    if (!row.raw_data) continue;
    const lines = expandFinancialEvent(row.raw_data as Record<string, unknown>);
    if (lines.length === 0) continue;

    const line = lines[0];
    const duplicate = await FinancialEvent.findOne({
      where: {
        account_id: accountId,
        id: { [Op.ne]: row.id },
        amazon_order_id: row.amazon_order_id,
        event_type: row.event_type,
        fee_type: line.feeType,
        amount: line.amount,
      },
    });

    if (duplicate) {
      await row.destroy();
      fixed++;
      continue;
    }

    await row.update({ amount: line.amount, currency: line.currency, fee_type: line.feeType });
    fixed++;
  }
  return fixed;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}