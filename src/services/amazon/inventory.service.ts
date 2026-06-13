import axios from 'axios';
import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount } from './auth.service';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';

interface InventorySummary {
  asin?: string;
  sellerSku?: string;
  fnSku?: string;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
    reservedQuantity?: { totalReservedQuantity?: number };
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
  };
}

export async function fetchInventorySummaries(
  account: SellerAccount
): Promise<InventorySummary[]> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);
  const allSummaries: InventorySummary[] = [];
  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = {
      granularityType: 'Marketplace',
      granularityId: account.marketplace_id,
      marketplaceIds: account.marketplace_id,
    };
    if (nextToken) params.nextToken = nextToken;

    const response = await withRateLimit(account.id, () =>
      withRetry(() =>
        axios.get(`${endpoint}/fba/inventory/v1/summaries`, {
          params,
          headers: { 'x-amz-access-token': accessToken },
        })
      )
    );

    const summaries = response.data.payload?.inventorySummaries || [];
    allSummaries.push(...summaries);
    nextToken = response.data.pagination?.nextToken;
  } while (nextToken);

  return allSummaries;
}
