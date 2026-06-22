import { amazonConfig } from '../../config/amazon';
import { SellerAccount } from '../../models';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { spApiRequest } from './spApiClient';

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

    const data = await withRateLimit(account.id, () =>
      withRetry(() =>
        spApiRequest<GetOrdersResponse>(account, 'GET', '/orders/v0/orders', { params })
      )
    );

    const orders = data.payload?.Orders || [];
    allOrders.push(...orders);
    nextToken = data.payload?.NextToken;
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

interface GetOrderItemsResponse {
  payload?: { OrderItems?: OrderItem[] };
}

export async function fetchOrderItems(
  account: SellerAccount,
  amazonOrderId: string
): Promise<OrderItem[]> {
  const data = await withRateLimit(account.id, () =>
    withRetry(() =>
      spApiRequest<GetOrderItemsResponse>(
        account,
        'GET',
        `/orders/v0/orders/${amazonOrderId}/orderItems`
      )
    )
  );

  return data.payload?.OrderItems || [];
}
