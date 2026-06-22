import { Op } from 'sequelize';
import { SellerAccount, InventorySnapshot, Product } from '../../models';
import { fetchListingItem } from '../amazon/listings.service';
import { logger } from '../../utils/logger';

export async function syncListingsForAccount(account: SellerAccount): Promise<number> {
  const latestSnap = await InventorySnapshot.findOne({
    where: { account_id: account.id },
    order: [['snapshotted_at', 'DESC']],
    attributes: ['snapshotted_at'],
  });

  if (!latestSnap) {
    logger.info(`No inventory snapshots for listings sync on ${account.name}`);
    return 0;
  }

  const skuRows = await InventorySnapshot.findAll({
    where: {
      account_id: account.id,
      snapshotted_at: latestSnap.snapshotted_at,
      sku: { [Op.ne]: null },
    },
    attributes: ['sku'],
  });

  const skus = [...new Set(skuRows.map((r) => r.sku).filter(Boolean))] as string[];
  if (skus.length === 0) return 0;

  let synced = 0;
  for (const sku of skus) {
    const listing = await fetchListingItem(account, sku);
    if (!listing) continue;

    const summaries = (listing.summaries as Array<Record<string, unknown>>) || [];
    const summary = summaries[0] || {};
    const asin = (summary.asin as string) || (listing.asin as string) || 'UNKNOWN';

    await Product.upsert(
      {
        account_id: account.id,
        asin,
        sku,
        title: (summary.itemName as string) || null,
        listing_status: (summary.status as string) || null,
        raw_data: listing,
      },
      { conflictFields: ['account_id', 'asin'] }
    );

    synced++;
  }

  return synced;
}
