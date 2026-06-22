import { SellerAccount, FinancialEvent } from '../../models';
import {
  requestSettlementReport,
  pollReportStatus,
  downloadReport,
} from '../amazon/reports.service';
import { logger } from '../../utils/logger';

function parseSettlementTsv(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

export async function syncReportsForAccount(account: SellerAccount): Promise<number> {
  const reportId = await requestSettlementReport(account);
  if (!reportId) {
    logger.warn(`No settlement report ID for ${account.name}`);
    return 0;
  }

  const documentId = await pollReportStatus(account, reportId);
  if (!documentId) return 0;

  const content = await downloadReport(account, documentId);
  const rows = parseSettlementTsv(content);
  let synced = 0;

  for (const row of rows) {
    const orderId = row['order-id'] || row['Order ID'] || null;
    const amountStr = row['amount'] || row['Amount'] || row['total-amount'] || '';
    const amount = amountStr ? parseFloat(amountStr) : null;
    const postedDateStr = row['posted-date'] || row['Posted Date'] || row['settlement-end-date'];
    const postedDate = postedDateStr ? new Date(postedDateStr) : new Date();
    const feeType = row['amount-type'] || row['transaction-type'] || row['Amount Type'] || null;
    const eventType = row['amount-description'] || row['Transaction Type'] || 'settlement';

    if (!amount && !orderId) continue;

    const existing = await FinancialEvent.findOne({
      where: {
        account_id: account.id,
        amazon_order_id: orderId,
        event_type: eventType,
        fee_type: feeType,
        posted_date: postedDate,
      },
    });

    if (existing) continue;

    await FinancialEvent.create({
      account_id: account.id,
      amazon_order_id: orderId,
      event_type: eventType,
      amount,
      currency: row['currency'] || row['Currency'] || 'USD',
      fee_type: feeType,
      posted_date: postedDate,
      raw_data: row,
    });

    synced++;
  }

  return synced;
}
