import { Op } from 'sequelize';
import { FinancialEvent } from '../models';
import { expandFinancialEvent } from './financeEventParser';
export function buildFinanceLineKey(parts: {
  amazon_order_id?: string | null;
  event_type?: string | null;
  fee_type?: string | null;
  amount?: number | string | null;
}): string {
  const amount =
    parts.amount === null || parts.amount === undefined
      ? 'null'
      : Number(parts.amount).toFixed(2);
  return [
    parts.amazon_order_id || '',
    parts.event_type || '',
    parts.fee_type || '',
    amount,
  ].join('|');
}

export async function dedupeFinancialEvents(accountId: string): Promise<number> {
  const rows = await FinancialEvent.findAll({
    where: { account_id: accountId },
    order: [['created_at', 'ASC']],
    attributes: ['id', 'amazon_order_id', 'event_type', 'fee_type', 'amount'],
  });

  const seen = new Set<string>();
  const idsToDelete: string[] = [];

  for (const row of rows) {
    const key = buildFinanceLineKey({
      amazon_order_id: row.amazon_order_id,
      event_type: row.event_type,
      fee_type: row.fee_type,
      amount: row.amount,
    });

    if (seen.has(key)) {
      idsToDelete.push(row.id);
    } else {
      seen.add(key);
    }
  }

  const batchSize = 500;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    await FinancialEvent.destroy({ where: { id: { [Op.in]: batch } } });
  }

  return idsToDelete.length;
}
export async function cleanupNullAmountDuplicates(accountId: string): Promise<number> {
  const nullRows = await FinancialEvent.findAll({
    where: { account_id: accountId, amount: null },
  });

  let deleted = 0;

  for (const row of nullRows) {
    if (!row.raw_data) continue;

    const lines = expandFinancialEvent(row.raw_data as Record<string, unknown>);
    if (lines.length === 0) continue;

    const hasPopulatedSibling = await FinancialEvent.findOne({
      where: {
        account_id: accountId,
        id: { [Op.ne]: row.id },
        amazon_order_id: row.amazon_order_id,
        event_type: row.event_type,
        amount: lines[0].amount,
        fee_type: lines[0].feeType,
      },
    });

    if (hasPopulatedSibling) {
      await row.destroy();
      deleted++;
    }
  }

  return deleted;
}
