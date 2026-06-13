import axios from 'axios';
import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount } from './auth.service';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

export async function requestSettlementReport(account: SellerAccount): Promise<string | null> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);

  const response = await withRateLimit(account.id, () =>
    withRetry(() =>
      axios.post(
        `${endpoint}/reports/2021-06-30/reports`,
        {
          reportType: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
          marketplaceIds: [account.marketplace_id],
        },
        { headers: { 'x-amz-access-token': accessToken, 'Content-Type': 'application/json' } }
      )
    )
  );

  return response.data.reportId || null;
}

export async function pollReportStatus(
  account: SellerAccount,
  reportId: string,
  maxAttempts = 30
): Promise<string | null> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);

  for (let i = 0; i < maxAttempts; i++) {
    const response = await axios.get(`${endpoint}/reports/2021-06-30/reports/${reportId}`, {
      headers: { 'x-amz-access-token': accessToken },
    });

    const status = response.data.processingStatus;
    if (status === 'DONE') {
      return response.data.reportDocumentId;
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
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);

  const docResponse = await axios.get(
    `${endpoint}/reports/2021-06-30/documents/${reportDocumentId}`,
    { headers: { 'x-amz-access-token': accessToken } }
  );

  const downloadUrl = docResponse.data.url;
  const reportResponse = await axios.get(downloadUrl);
  return typeof reportResponse.data === 'string' ? reportResponse.data : JSON.stringify(reportResponse.data);
}
