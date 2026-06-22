import { refreshAllAccountTokens } from '../services/amazon/auth.service';
import { runSyncForAllAccounts } from '../services/sync/syncRunner';
import { logger } from '../utils/logger';
import { isAmazonConfigured } from '../config';

export async function runTokenRefreshWorker(): Promise<void> {
  logger.info('Running token refresh worker');
  await refreshAllAccountTokens();
}

export async function runOrderSyncWorker(): Promise<void> {
  if (!isAmazonConfigured()) return;
  logger.info('Running order sync worker');
  await runSyncForAllAccounts('orders');
}

export async function runInventorySyncWorker(): Promise<void> {
  if (!isAmazonConfigured()) return;
  logger.info('Running inventory sync worker');
  await runSyncForAllAccounts('inventory');
}

export async function runFinanceSyncWorker(): Promise<void> {
  if (!isAmazonConfigured()) return;
  logger.info('Running finance sync worker');
  await runSyncForAllAccounts('finance');
}

export async function runListingsSyncWorker(): Promise<void> {
  if (!isAmazonConfigured()) return;
  logger.info('Running listings sync worker');
  await runSyncForAllAccounts('listings');
}

export async function runReportsSyncWorker(): Promise<void> {
  if (!isAmazonConfigured()) return;
  logger.info('Running reports sync worker');
  await runSyncForAllAccounts('reports');
}
