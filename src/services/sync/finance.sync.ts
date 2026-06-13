import { SellerAccount } from '../../models';
import { FinancialEvent } from '../../models';
import { fetchFinancialEvents } from '../amazon/finance.service';

export async function syncFinanceForAccount(account: SellerAccount): Promise<number> {
  const postedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await fetchFinancialEvents(account, postedAfter);
  let synced = 0;

  for (const event of events) {
    const eventType = (event.eventType as string) || 'unknown';
    const amount = extractAmount(event);

    await FinancialEvent.create({
      account_id: account.id,
      amazon_order_id: (event.AmazonOrderId as string) || null,
      event_type: eventType,
      amount,
      currency: extractCurrency(event),
      fee_type: extractFeeType(event),
      posted_date: event.PostedDate ? new Date(event.PostedDate as string) : new Date(),
      raw_data: event,
    });
    synced++;
  }

  return synced;
}

function extractAmount(event: Record<string, unknown>): number | null {
  for (const key of Object.keys(event)) {
    const val = event[key];
    if (val && typeof val === 'object' && 'Amount' in (val as object)) {
      return parseFloat((val as { Amount: string }).Amount);
    }
  }
  return null;
}

function extractCurrency(event: Record<string, unknown>): string | null {
  for (const key of Object.keys(event)) {
    const val = event[key];
    if (val && typeof val === 'object' && 'CurrencyCode' in (val as object)) {
      return (val as { CurrencyCode: string }).CurrencyCode;
    }
  }
  return 'USD';
}

function extractFeeType(event: Record<string, unknown>): string | null {
  if (event.FeeType) return event.FeeType as string;
  if (event.FeeDescription) return event.FeeDescription as string;
  return null;
}
