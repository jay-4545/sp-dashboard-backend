import { SellerAccount } from '../../models';
import { InventorySnapshot } from '../../models';
import { fetchInventorySummaries } from '../amazon/inventory.service';

export async function syncInventoryForAccount(account: SellerAccount): Promise<number> {
  const summaries = await fetchInventorySummaries(account);
  const now = new Date();
  let synced = 0;

  for (const summary of summaries) {
    const details = summary.inventoryDetails;
    const inbound =
      (details?.inboundWorkingQuantity || 0) +
      (details?.inboundShippedQuantity || 0) +
      (details?.inboundReceivingQuantity || 0);

    await InventorySnapshot.create({
      account_id: account.id,
      asin: summary.asin || null,
      sku: summary.sellerSku || null,
      fnsku: summary.fnSku || null,
      sellable_qty: details?.fulfillableQuantity || 0,
      unsellable_qty: details?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0,
      reserved_qty: details?.reservedQuantity?.totalReservedQuantity || 0,
      inbound_qty: inbound,
      snapshotted_at: now,
    });
    synced++;
  }

  return synced;
}
