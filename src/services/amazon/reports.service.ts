import axios from 'axios';
import { SellerAccount } from '../../models';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';
import { spApiRequest } from './spApiClient';

interface CreateReportResponse {
  reportId?: string;
}

interface ReportStatusResponse {
  processingStatus?: string;
  reportDocumentId?: string;
}

interface ReportDocumentResponse {
  url?: string;
}

export async function requestSettlementReport(account: SellerAccount): Promise<string | null> {
  const data = await withRateLimit(account.id, () =>
    withRetry(() =>
      spApiRequest<CreateReportResponse>(account, 'POST', '/reports/2021-06-30/reports', {
        data: {
          reportType: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
          marketplaceIds: [account.marketplace_id],
        },
      })
    )
  );

  return data.reportId || null;
}

export async function pollReportStatus(
  account: SellerAccount,
  reportId: string,
  maxAttempts = 30
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const data = await spApiRequest<ReportStatusResponse>(
      account,
      'GET',
      `/reports/2021-06-30/reports/${reportId}`
    );

    const status = data.processingStatus;
    if (status === 'DONE') {
      return data.reportDocumentId || null;
    }
    if (status === 'FATAL' || status === 'CANCELLED') {
      logger.error(`Report ${reportId} failed with status ${status}`);
      return null;
    }

    await new Promise((r) => setTimeout(r, 10000));
  }

  return null;
}

export async function downloadReport(
  account: SellerAccount,
  reportDocumentId: string
): Promise<string> {
  const docData = await spApiRequest<ReportDocumentResponse>(
    account,
    'GET',
    `/reports/2021-06-30/documents/${reportDocumentId}`
  );

  const downloadUrl = docData.url;
  if (!downloadUrl) {
    throw new Error('Report document URL not available');
  }

  const reportResponse = await axios.get(downloadUrl);
  return typeof reportResponse.data === 'string'
    ? reportResponse.data
    : JSON.stringify(reportResponse.data);
}
