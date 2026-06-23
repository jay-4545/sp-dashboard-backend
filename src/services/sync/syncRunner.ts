import { Op } from 'sequelize';
import { isAmazonConfigured } from '../../config';
import { SellerAccount, SyncJob } from '../../models';
import { SyncType } from '../../models/SyncJob';
import { logger } from '../../utils/logger';
import { syncOrdersForAccount } from './orders.sync';
import { syncInventoryForAccount } from './inventory.sync';
import { syncFinanceForAccount } from './finance.sync';
import { syncReportsForAccount } from './reports.sync';
import { syncListingsForAccount } from './listings.sync';
import { expireOrphanedSyncJobsOnStartup, expireStaleRunningJob } from './syncJobUtils';
import { syncProductsForAccount } from './products.sync';

export { expireOrphanedSyncJobsOnStartup, resetStuckSyncJobs } from './syncJobUtils';

const syncHandlers: Record<SyncType, (account: SellerAccount) => Promise<number>> = {
  orders: syncOrdersForAccount,
  inventory: syncInventoryForAccount,
  finance: syncFinanceForAccount,
  reports: syncReportsForAccount,
  listings: syncListingsForAccount,
  products: syncProductsForAccount,   
};

export async function runSyncForAccount(accountId: string, syncType: SyncType) {
  if (!isAmazonConfigured()) {
    const job = await SyncJob.create({
      account_id: accountId,
      sync_type: syncType,
      status: 'failed',
      error_message: 'Amazon SP-API credentials not configured. Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET to .env',
      finished_at: new Date(),
    });
    return job;
  }

  const account = await SellerAccount.findByPk(accountId);
  if (!account) {
    throw new Error('Account not found');
  }

  if (!account.refresh_token) {
    const job = await SyncJob.create({
      account_id: accountId,
      sync_type: syncType,
      status: 'failed',
      error_message: `No refresh token configured for account ${account.name}`,
      finished_at: new Date(),
    });
    return job;
  }

  const blockingJob = await expireStaleRunningJob(accountId, syncType, account.name);
  if (blockingJob) {
    logger.warn(`Sync already running: ${syncType} for ${account.name}`);
    return blockingJob;
  }

  const job = await SyncJob.create({
    account_id: accountId,
    sync_type: syncType,
    status: 'running',
  });

  try {
    const handler = syncHandlers[syncType];
    const recordsSynced = await handler(account);
    await job.update({
      status: 'success',
      records_synced: recordsSynced,
      finished_at: new Date(),
    });
    await account.update({ last_synced_at: new Date() });
  } catch (err) {
    const message = (err as Error).message;
    logger.error(`Sync failed: ${syncType} for ${account.name}`, { error: message });
    await job.update({
      status: 'failed',
      error_message: message,
      finished_at: new Date(),
    });
  }

  return job;
}

export async function runSyncForAllAccounts(syncType: SyncType) {
  const accounts = await SellerAccount.findAll({
    where: { is_active: true, refresh_token: { [Op.ne]: null } },
    order: [['name', 'ASC']],
  });

  for (const account of accounts) {
    await runSyncForAccount(account.id, syncType);
  }
}
