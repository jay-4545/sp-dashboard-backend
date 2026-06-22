import { SellerAccount } from '../../models';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { spApiRequest } from './spApiClient';

interface FinancialEventRecord {
  AmazonOrderId?: string;
  PostedDate?: string;
  [key: string]: unknown;
}

interface FinancialEventsResponse {
  payload?: {
    FinancialEvents?: Record<string, unknown[]>;
    NextToken?: string;
  };
}

export async function fetchFinancialEvents(
  account: SellerAccount,
  postedAfter?: Date
): Promise<FinancialEventRecord[]> {
  const allEvents: FinancialEventRecord[] = [];
  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = { MaxResultsPerPage: '100' };
    if (postedAfter) params.PostedAfter = postedAfter.toISOString();
    if (nextToken) params.NextToken = nextToken;

    const data = await withRateLimit(account.id, () =>
      withRetry(() =>
        spApiRequest<FinancialEventsResponse>(account, 'GET', '/finances/v0/financialEvents', {
          params,
        })
      )
    );

    const events = data.payload?.FinancialEvents || {};
    for (const [eventType, eventList] of Object.entries(events)) {
      if (Array.isArray(eventList)) {
        for (const event of eventList) {
          allEvents.push({ ...(event as Record<string, unknown>), eventType });
        }
      }
    }
    nextToken = data.payload?.NextToken;
  } while (nextToken);

  return allEvents;
}
