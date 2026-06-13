import axios from 'axios';
import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount } from './auth.service';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';

interface AmazonOrder {
  AmazonOrderId: string;
  OrderStatus: string;
  MarketplaceId: string;
  OrderTotal?: { Amount: string; CurrencyCode: string };
  FulfillmentChannel: string;
  PurchaseDate: string;
}

interface GetOrdersResponse {
  payload?: {
    Orders?: AmazonOrder[];
    NextToken?: string;
  };
}

export async function fetchOrders(
  account: SellerAccount,
  lastUpdatedAfter?: Date
): Promise<AmazonOrder[]> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);
  const allOrders: AmazonOrder[] = [];
  let nextToken: string | undefined;

  do {
    const params: Record<string, string> = {
      MarketplaceIds: account.marketplace_id,
      MaxResultsPerPage: '100',
    };
    if (lastUpdatedAfter) {
      params.LastUpdatedAfter = lastUpdatedAfter.toISOString();
    }
    if (nextToken) {
      params.NextToken = nextToken;
    }

    const response = await withRateLimit(account.id, () =>
      withRetry(() =>
        axios.get<GetOrdersResponse>(`${endpoint}/orders/v0/orders`, {
          params,
          headers: { 'x-amz-access-token': accessToken },
        })
      )
    );

    const orders = response.data.payload?.Orders || [];
    allOrders.push(...orders);
    nextToken = response.data.payload?.NextToken;
  } while (nextToken);

  return allOrders;
}

interface OrderItem {
  ASIN: string;
  SellerSKU: string;
  Title: string;
  QuantityOrdered: number;
  ItemPrice?: { Amount: string };
  ItemTax?: { Amount: string };
  PromotionDiscount?: { Amount: string };
}

export async function fetchOrderItems(
  account: SellerAccount,
  amazonOrderId: string
): Promise<OrderItem[]> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const endpoint = amazonConfig.getEndpoint(account.region);

  const response = await withRateLimit(account.id, () =>
    withRetry(() =>
      axios.get(`${endpoint}/orders/v0/orders/${amazonOrderId}/orderItems`, {
        headers: { 'x-amz-access-token': accessToken },
      })
    )
  );

  return response.data.payload?.OrderItems || [];
}
