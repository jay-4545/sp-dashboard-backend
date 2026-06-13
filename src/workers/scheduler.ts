import cron from 'node-cron';
import { logger } from '../utils/logger';
import { isAmazonConfigured } from '../config';
import {
  runTokenRefreshWorker,
  runOrderSyncWorker,
  runInventorySyncWorker,
  runFinanceSyncWorker,
} from './tokenRefresh.worker';

export function startScheduler(): void {
  if (!isAmazonConfigured()) {
    logger.warn(
      'Amazon SP-API not configured — cron workers registered but will skip sync until credentials are added'
    );
  }

  cron.schedule('*/55 * * * *', () => {
    runTokenRefreshWorker().catch((err) =>
      logger.error('Token refresh worker error', { error: err.message })
    );
  });

  cron.schedule('*/15 * * * *', () => {
    runOrderSyncWorker().catch((err) =>
      logger.error('Order sync worker error', { error: err.message })
    );
  });

  cron.schedule('0 * * * *', () => {
    runInventorySyncWorker().catch((err) =>
      logger.error('Inventory sync worker error', { error: err.message })
    );
  });

  cron.schedule('0 */6 * * *', () => {
    runFinanceSyncWorker().catch((err) =>
      logger.error('Finance sync worker error', { error: err.message })
    );
  });

  logger.info('Cron scheduler started');
}
