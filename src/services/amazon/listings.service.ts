import axios from 'axios';
import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount } from './auth.service';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';

export async function fetchListingItem(
  account: SellerAccount,
  sku: string
): Promise<Record<string, unknown> | null> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);

  try {
    const response = await withRateLimit(account.id, () =>
      withRetry(() =>
        axios.get(
          `${endpoint}/listings/2021-08-01/items/${account.seller_id}/${encodeURIComponent(sku)}`,
          {
            params: { marketplaceIds: account.marketplace_id, includedData: 'summaries' },
            headers: { 'x-amz-access-token': accessToken },
          }
        )
      )
    );
    return response.data;
  } catch {
    return null;
  }
}
