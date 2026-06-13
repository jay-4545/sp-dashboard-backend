import { SellerAccount } from '../../models';
import { Order, OrderItem } from '../../models';
import { fetchOrders, fetchOrderItems } from '../amazon/orders.service';
import { logger } from '../../utils/logger';

export async function syncOrdersForAccount(account: SellerAccount): Promise<number> {
  const lastSync = account.last_synced_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const amazonOrders = await fetchOrders(account, lastSync);
  let synced = 0;

  for (const amazonOrder of amazonOrders) {
    await Order.upsert({
      account_id: account.id,
      amazon_order_id: amazonOrder.AmazonOrderId,
      status: amazonOrder.OrderStatus,
      marketplace_id: amazonOrder.MarketplaceId,
      order_total: amazonOrder.OrderTotal ? parseFloat(amazonOrder.OrderTotal.Amount) : null,
      currency: amazonOrder.OrderTotal?.CurrencyCode || null,
      fulfillment_channel: amazonOrder.FulfillmentChannel === 'AFN' ? 'FBA' : 'FBM',
      purchase_date: new Date(amazonOrder.PurchaseDate),
      raw_data: amazonOrder as unknown as Record<string, unknown>,
    });

    const orderRecord = await Order.findOne({
      where: { amazon_order_id: amazonOrder.AmazonOrderId },
    });

    if (!orderRecord) continue;

    const existingItems = await OrderItem.count({ where: { order_id: orderRecord.id } });
    if (existingItems === 0) {
      try {
        const items = await fetchOrderItems(account, amazonOrder.AmazonOrderId);
        for (const item of items) {
          await OrderItem.create({
            order_id: orderRecord.id,
            account_id: account.id,
            asin: item.ASIN,
            sku: item.SellerSKU,
            title: item.Title,
            quantity: item.QuantityOrdered,
            item_price: item.ItemPrice ? parseFloat(item.ItemPrice.Amount) : null,
            item_tax: item.ItemTax ? parseFloat(item.ItemTax.Amount) : null,
            promotion_discount: item.PromotionDiscount
              ? parseFloat(item.PromotionDiscount.Amount)
              : null,
          });
        }
      } catch (err) {
        logger.warn(`Failed to fetch items for order ${amazonOrder.AmazonOrderId}`, {
          error: (err as Error).message,
        });
      }
    }

    synced++;
  }

  return synced;
}
