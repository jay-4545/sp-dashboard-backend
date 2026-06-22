import { SellerAccount } from '../../models';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { spApiRequest } from './spApiClient';

export async function fetchListingItem(
  account: SellerAccount,
  sku: string
): Promise<Record<string, unknown> | null> {
  try {
    const data = await withRateLimit(account.id, () =>
      withRetry(() =>
        spApiRequest<Record<string, unknown>>(
          account,
          'GET',
          `/listings/2021-08-01/items/${account.seller_id}/${encodeURIComponent(sku)}`,
          {
            params: {
              marketplaceIds: account.marketplace_id,
              includedData: 'summaries',
            },
          }
        )
      )
    );
    return data;
  } catch {
    return null;
  }
}

export async function fetchListingItemsForSkus(
  account: SellerAccount,
  skus: string[]
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for (const sku of skus) {
    const item = await fetchListingItem(account, sku);
    if (item) results.push(item);
  }
  return results;
}
