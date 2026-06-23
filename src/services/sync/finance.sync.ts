import { Op } from 'sequelize';
import { SellerAccount, Order, FinancialEvent } from '../../models';
import { fetchFinancialEvents } from '../amazon/finance.service';
import { expandFinancialEvent } from '../../utils/financeEventParser';
import { buildFinanceLineKey } from '../../utils/financeDedupe';
import {
  dedupeFinancialEvents,
  cleanupNullAmountDuplicates,
} from '../../utils/financeDedupe';

/**
 * PERFORMANCE-OPTIMIZED finance sync.
 *
 * Junu version har financial line mate 2 DB query karto hato (findOne + create).
 * 4415 events = ~9000 sequential queries = bahuj slow.
 *
 * Navu version:
 *   1. Account na BADHA existing events ek j query ma load kare (key set banave).
 *   2. Amazon na events parse kare, in-memory dedupe kare.
 *   3. Fakt NAVA rows ne `bulkCreate` thi batch ma insert kare.
 *
 * Result: ~9000 query mathi ghatine ~5-10 query. 10-50x faster.
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
  // Cleanup steps (juna duplicates / null amounts) — ek vaar chale.
  const cleaned = await cleanupNullAmountDuplicates(account.id);
  const deduped = await dedupeFinancialEvents(account.id);
  const backfilled = await backfillNullAmounts(account.id);

  const orderDateCache = await loadOrderDateCache(account.id);
  const datesFixed = await fixEpochPostedDates(account.id, orderDateCache);

  // 1. BADHA existing event keys ek j query ma load karo (in-memory dedupe mate).
  const existingKeys = await loadExistingEventKeys(account.id);

  // 2. Amazon thi events fetch karo.
  const postedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await fetchFinancialEvents(account, postedAfter);

  // 3. Parse + in-memory dedupe → pending insert list banavo.
  const toInsert: PendingEvent[] = [];
  const seenInThisRun = new Set<string>();

  for (const event of events) {
    const eventType = (event.eventType as string) || 'unknown';
    const amazonOrderId = (event.AmazonOrderId as string) || null;
    const postedDate = resolvePostedDate(event, amazonOrderId, orderDateCache);
    const lines = expandFinancialEvent(event);

    if (lines.length === 0) {
      queueIfNew(
        toInsert,
        existingKeys,
        seenInThisRun,
        {
          account_id: account.id,
          amazon_order_id: amazonOrderId,
          event_type: eventType,
          amount: null,
          currency: 'INR',
          fee_type: null,
          posted_date: postedDate,
          raw_data: event,
        }
      );
      continue;
    }

    for (const line of lines) {
      queueIfNew(
        toInsert,
        existingKeys,
        seenInThisRun,
        {
          account_id: account.id,
          amazon_order_id: amazonOrderId,
          event_type: eventType,
          amount: line.amount,
          currency: line.currency,
          fee_type: line.feeType,
          posted_date: postedDate,
          raw_data: event,
        }
      );
    }
  }

  // 4. Batch insert — har batch ek j query.
  let synced = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    await FinancialEvent.bulkCreate(batch, { ignoreDuplicates: true });
    synced += batch.length;
  }

  const dedupedAfter = await dedupeFinancialEvents(account.id);
  return synced + backfilled + cleaned + deduped + dedupedAfter + datesFixed;
}

/** Ek event ne pending list ma add karo fakt jo e navu hoy (DB ma ya aa run ma na hoy). */
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

/** Account na badha events ek query ma load karine dedupe-key set banave. */
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
    if (order.purchase_date) {
      cache.set(order.amazon_order_id, order.purchase_date);
    }
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

  // Group rows by their resolved date so we can issue fewer UPDATEs.
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
  if (event.PostedDate) {
    return new Date(event.PostedDate as string);
  }

  if (amazonOrderId && orderDateCache.has(amazonOrderId)) {
    return orderDateCache.get(amazonOrderId)!;
  }

  // Stable fallback — never use new Date() (that created a new row on every sync).
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

    await row.update({
      amount: line.amount,
      currency: line.currency,
      fee_type: line.feeType,
    });
    fixed++;
  }

  return fixed;
}