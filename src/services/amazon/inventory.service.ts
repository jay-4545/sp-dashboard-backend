import { SellerAccount } from '../../models';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { spApiRequest } from './spApiClient';
import { logger } from '../../utils/logger';

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

interface InventoryResponse {
  payload?: { inventorySummaries?: InventorySummary[] };
  pagination?: { nextToken?: string };
}

export async function fetchInventorySummaries(
  account: SellerAccount
): Promise<InventorySummary[]> {
  const allSummaries: InventorySummary[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const params: Record<string, string> = {
        granularityType: 'Marketplace',
        granularityId: account.marketplace_id,
        marketplaceIds: account.marketplace_id,
        details: 'true',
      };
      if (nextToken) params.nextToken = nextToken;

      const data = await withRateLimit(account.id, () =>
        withRetry(() =>
          spApiRequest<InventoryResponse>(account, 'GET', '/fba/inventory/v1/summaries', { params })
        )
      );

      const summaries = data.payload?.inventorySummaries || [];
      allSummaries.push(...summaries);
      nextToken = data.pagination?.nextToken;
    } while (nextToken);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('not registered in marketplace')) {
      logger.warn(`Skipping FBA inventory for ${account.name}: seller not enrolled in FBA for this marketplace`);
      return [];
    }
    throw error;
  }

  return allSummaries;
}
