import axios from 'axios';
import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount } from './auth.service';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';

interface FinancialEventRecord {
  AmazonOrderId?: string;
  PostedDate?: string;
  [key: string]: unknown;
}

export async function fetchFinancialEvents(
  account: SellerAccount,
  postedAfter?: Date
): Promise<FinancialEventRecord[]> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);
  const allEvents: FinancialEventRecord[] = [];
  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = { MaxResultsPerPage: '100' };
    if (postedAfter) params.PostedAfter = postedAfter.toISOString();
    if (nextToken) params.NextToken = nextToken;

    const response = await withRateLimit(account.id, () =>
      withRetry(() =>
        axios.get(`${endpoint}/finances/v0/financialEvents`, {
          params,
          headers: { 'x-amz-access-token': accessToken },
        })
      )
    );

    const events = response.data.payload?.FinancialEvents || {};
    for (const [eventType, eventList] of Object.entries(events)) {
      if (Array.isArray(eventList)) {
        for (const event of eventList) {
          allEvents.push({ ...event, eventType });
        }
      }
    }
    nextToken = response.data.payload?.NextToken;
  } while (nextToken);

  return allEvents;
}
