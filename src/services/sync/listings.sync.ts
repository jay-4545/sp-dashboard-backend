import { Op } from 'sequelize';
import { SellerAccount, InventorySnapshot, Product } from '../../models';
import { fetchListingItem } from '../amazon/listings.service';
import { logger } from '../../utils/logger';

/**
 * Listings sync — listing nu PURU data store kare:
 *   - title, asin, sku, status[] (DISCOVERABLE, BUYABLE...)
 *   - selling_price (our_price value_with_tax), mrp (maximum_retail_price)
 *   - quantity (fulfillmentAvailability), product_type, condition, main_image
 *
 * Listing JSON ma price be jagya e hoy che:
 *   attributes.purchasable_offer[].our_price[].schedule[].value_with_tax
 *   offers[].price.amount
 * Aapne pehlu prefer karie, offers fallback.
 */
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

    const parsed = parseListing(listing, sku);

    await Product.upsert(
      {
        account_id: account.id,
        asin: parsed.asin,
        sku,
        title: parsed.title,
        listing_status: parsed.status,
        product_type: parsed.productType,
        condition_type: parsed.condition,
        selling_price: parsed.sellingPrice,
        mrp: parsed.mrp,
        quantity: parsed.quantity,
        currency: parsed.currency,
        main_image: parsed.mainImage,
        raw_data: listing,
      },
      { conflictFields: ['account_id', 'asin'] }
    );

    synced++;
  }

  return synced;
}

interface ParsedListing {
  asin: string;
  title: string | null;
  status: string[] | null;
  productType: string | null;
  condition: string | null;
  sellingPrice: number | null;
  mrp: number | null;
  quantity: number | null;
  currency: string | null;
  mainImage: string | null;
}

export function parseListing(listing: Record<string, unknown>, sku: string): ParsedListing {
  const summaries = (listing.summaries as Array<Record<string, unknown>>) || [];
  const summary = summaries[0] || {};
  const attributes = (listing.attributes as Record<string, unknown>) || {};

  const asin = (summary.asin as string) || (listing.asin as string) || 'UNKNOWN';
  const title = (summary.itemName as string) || null;

  // status array tarike rakho.
  const status = Array.isArray(summary.status)
    ? (summary.status as string[])
    : summary.status
    ? [String(summary.status)]
    : null;

  const productType = (summary.productType as string) || null;
  const condition = (summary.conditionType as string) || firstAttrValue(attributes, 'condition_type');

  // main image
  const mainImage =
    (summary.mainImage as Record<string, unknown>)?.link != null
      ? String((summary.mainImage as Record<string, unknown>).link)
      : null;

  // price + currency from purchasable_offer
  const offer = firstArrayItem(attributes.purchasable_offer);
  const currency = (offer?.currency as string) || firstOfferCurrency(listing) || 'INR';
  const sellingPrice =
    extractScheduleValue(offer?.our_price) ?? extractOfferPrice(listing) ?? null;
  const mrp = extractScheduleValue(offer?.maximum_retail_price) ?? null;

  // quantity from fulfillmentAvailability (top-level) or attributes.fulfillment_availability
  const quantity =
    extractQuantity(listing.fulfillmentAvailability) ??
    extractQuantity(attributes.fulfillment_availability) ??
    null;

  return {
    asin,
    title,
    status,
    productType,
    condition,
    sellingPrice,
    mrp,
    quantity,
    currency,
    mainImage,
  };
}

/* ---------------- extraction helpers ---------------- */

function firstArrayItem(v: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
    return v[0] as Record<string, unknown>;
  }
  return undefined;
}

function firstAttrValue(attributes: Record<string, unknown>, key: string): string | null {
  const arr = attributes[key];
  const item = firstArrayItem(arr);
  return item && item.value != null ? String(item.value) : null;
}

/**
 * purchasable_offer.our_price = [{ schedule: [{ value_with_tax: 395.0 }] }]
 */
function extractScheduleValue(priceArr: unknown): number | null {
  const item = firstArrayItem(priceArr);
  if (!item) return null;
  const schedule = firstArrayItem(item.schedule);
  if (!schedule) return null;
  const v = schedule.value_with_tax ?? schedule.value;
  return v != null && !isNaN(Number(v)) ? Number(v) : null;
}

/** offers[].price.amount fallback. */
function extractOfferPrice(listing: Record<string, unknown>): number | null {
  const offers = listing.offers;
  const offer = firstArrayItem(offers);
  const price = offer?.price as Record<string, unknown> | undefined;
  if (price && price.amount != null && !isNaN(Number(price.amount))) {
    return Number(price.amount);
  }
  return null;
}

function firstOfferCurrency(listing: Record<string, unknown>): string | null {
  const offer = firstArrayItem(listing.offers);
  const price = offer?.price as Record<string, unknown> | undefined;
  return price && price.currency ? String(price.currency) : null;
}

/** fulfillmentAvailability = [{ fulfillmentChannelCode: 'DEFAULT', quantity: 9 }] */
function extractQuantity(arr: unknown): number | null {
  const item = firstArrayItem(arr);
  if (!item) return null;
  const q = item.quantity;
  return q != null && !isNaN(Number(q)) ? Number(q) : null;
}