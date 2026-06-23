import { SellerAccount, Product } from '../../models';
import {
  pollReportStatus,
  downloadReport,
} from '../amazon/reports.service';
import { spApiRequest } from '../amazon/spApiClient';
import { withRateLimit } from '../../utils/amazonRateLimit';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

/**
 * Products sync via the MERCHANT LISTINGS report.
 *
 * Juno listings.sync inventory snapshot par depend karto hato — etle jo FBA
 * inventory khali hoy to products pan khali rehta. Aa version
 * GET_MERCHANT_LISTINGS_ALL_DATA report vaapre, je FBM + FBA BADHI listings aape,
 * inventory thi swatantra.
 *
 * Aa ne syncRunner ma `listings` (athva navo `products`) handler tarike vaapro.
 */

const MERCHANT_LISTINGS_REPORT = 'GET_MERCHANT_LISTINGS_ALL_DATA';

async function requestMerchantListingsReport(
  account: SellerAccount
): Promise<string | null> {
  const data = await withRateLimit(account.id, () =>
    withRetry(() =>
      spApiRequest<{ reportId?: string }>(account, 'POST', '/reports/2021-06-30/reports', {
        data: {
          reportType: MERCHANT_LISTINGS_REPORT,
          marketplaceIds: [account.marketplace_id],
        },
      })
    )
  );
  return data.reportId || null;
}

function parseListingsTsv(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

export async function syncProductsForAccount(account: SellerAccount): Promise<number> {
  const reportId = await requestMerchantListingsReport(account);
  if (!reportId) {
    logger.warn(`No listings report ID for ${account.name}`);
    return 0;
  }

  const documentId = await pollReportStatus(account, reportId);
  if (!documentId) {
    logger.warn(`Listings report not ready for ${account.name}`);
    return 0;
  }

  const content = await downloadReport(account, documentId);
  const rows = parseListingsTsv(content);
  if (rows.length === 0) {
    logger.info(`No listings rows for ${account.name}`);
    return 0;
  }

  // Merchant listings report columns (header names vary slightly by marketplace):
  //   seller-sku, asin1, item-name, status, price, quantity, ...
  const products = rows
    .map((row) => {
      const sku = row['seller-sku'] || row['sku'] || '';
      const asin = row['asin1'] || row['asin'] || '';
      if (!sku && !asin) return null;
      return {
        account_id: account.id,
        asin: asin || 'UNKNOWN',
        sku: sku || null,
        title: row['item-name'] || row['product-name'] || null,
        listing_status: row['status'] || row['listing-status'] || null,
        raw_data: row as Record<string, unknown>,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (products.length === 0) return 0;

  // Batch upsert — conflict on (account_id, asin).
  const BATCH = 500;
  let synced = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Product.bulkCreate(batch, {
      updateOnDuplicate: ['sku', 'title', 'listing_status', 'raw_data', 'updated_at'],
    });
    synced += batch.length;
  }

  logger.info(`Synced ${synced} products for ${account.name}`);
  return synced;
}