import { Op } from 'sequelize';
import { SellerAccount, Order, OrderItem, SyncJob } from '../../models';
import { fetchOrders, fetchOrderItems } from '../amazon/orders.service';
import { loadCostLookup, resolveCostFromLookup } from '../cost.service';
import { logger } from '../../utils/logger';

/**
 * Orders sync (India-only).
 *
 * LastUpdatedAfter window: last successful orders sync job date is used,
 * not account.last_synced_at (which gets overwritten by every sync type).
 * Fallback: 90 days so a fresh account or data-clear fetches full history.
 */
export async function syncOrdersForAccount(account: SellerAccount): Promise<number> {
  // Find the last successful orders sync job for this account.
  const lastSuccessfulJob = await SyncJob.findOne({
    where: {
      account_id: account.id,
      sync_type: 'orders',
      status: 'success',
    },
    order: [['started_at', 'DESC']],
  });

  // createdAfter: use last successful sync's start time (minus 5-min overlap),
  // or 90 days back for a fresh start / after data clear.
  const createdAfter = lastSuccessfulJob?.started_at
    ? new Date(lastSuccessfulJob.started_at.getTime() - 5 * 60 * 1000)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  logger.info(`Orders sync: createdAfter=${createdAfter.toISOString()} for account=${account.name}`);

  const amazonOrders = await fetchOrders(account, createdAfter);

  // COGS lookup ek j vaar load karo (fast in-memory resolve).
  const costLookup = await loadCostLookup(account.id);

  let synced = 0;

  for (const amazonOrder of amazonOrders) {
    const purchaseDate = amazonOrder.PurchaseDate ? new Date(amazonOrder.PurchaseDate) : null;

    await Order.upsert({
      account_id: account.id,
      amazon_order_id: amazonOrder.AmazonOrderId,
      status: amazonOrder.OrderStatus,
      marketplace_id: amazonOrder.MarketplaceId,
      order_total: amazonOrder.OrderTotal ? parseFloat(amazonOrder.OrderTotal.Amount) : null,
      currency: amazonOrder.OrderTotal?.CurrencyCode || 'INR',
      fulfillment_channel: amazonOrder.FulfillmentChannel === 'AFN' ? 'FBA' : 'FBM',
      purchase_date: purchaseDate,
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
          const qty = item.QuantityOrdered || 0;
          const cost = resolveCostFromLookup(costLookup, item.SellerSKU, purchaseDate);
          const totalCost = cost.found ? round2(cost.unitCost * qty) : null;

          await OrderItem.create({
            order_id: orderRecord.id,
            account_id: account.id,
            asin: item.ASIN,
            sku: item.SellerSKU,
            title: item.Title,
            quantity: qty,
            item_price: item.ItemPrice ? parseFloat(item.ItemPrice.Amount) : null,
            item_tax: item.ItemTax ? parseFloat(item.ItemTax.Amount) : null,
            promotion_discount: item.PromotionDiscount
              ? parseFloat(item.PromotionDiscount.Amount)
              : null,
            unit_cost: cost.found ? round2(cost.unitCost) : null,
            total_cost: totalCost,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}