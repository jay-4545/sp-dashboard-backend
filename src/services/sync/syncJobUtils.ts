import { SyncJob } from '../../models';
import { SyncType } from '../../models/SyncJob';
import { logger } from '../../utils/logger';

/** Max time a sync may stay in `running` before we treat it as stuck. */
const STALE_SYNC_MINUTES: Record<SyncType, number> = {
  orders: 20,
  inventory: 20,
  finance: 45,
  reports: 90,
  listings: 30,
};

const STALE_MESSAGE =
  'Sync timed out or was interrupted (e.g. server restart). Run sync again.';

export async function expireOrphanedSyncJobsOnStartup(): Promise<number> {
  const [count] = await SyncJob.update(
    {
      status: 'failed',
      error_message: STALE_MESSAGE,
      finished_at: new Date(),
    },
    { where: { status: 'running' } }
  );

  if (count > 0) {
    logger.warn(`Marked ${count} orphaned sync job(s) as failed after server start`);
  }

  return count;
}

export async function expireStaleRunningJob(
  accountId: string,
  syncType: SyncType,
  accountName: string
): Promise<SyncJob | null> {
  const runningJob = await SyncJob.findOne({
    where: { account_id: accountId, sync_type: syncType, status: 'running' },
    order: [['started_at', 'DESC']],
  });

  if (!runningJob) return null;

  const staleMs = STALE_SYNC_MINUTES[syncType] * 60 * 1000;
  const ageMs = Date.now() - new Date(runningJob.started_at).getTime();

  if (ageMs < staleMs) {
    return runningJob;
  }

  await runningJob.update({
    status: 'failed',
    error_message: STALE_MESSAGE,
    finished_at: new Date(),
  });

  logger.warn(
    `Marked stale sync as failed: ${syncType} for ${accountName} (running ${Math.round(ageMs / 60000)}m)`
  );

  return null;
}

export async function resetStuckSyncJobs(options?: {
  accountId?: string;
  syncType?: SyncType;
}): Promise<number> {
  const where: Record<string, unknown> = { status: 'running' };
  if (options?.accountId) where.account_id = options.accountId;
  if (options?.syncType) where.sync_type = options.syncType;

  const [count] = await SyncJob.update(
    {
      status: 'failed',
      error_message: STALE_MESSAGE,
      finished_at: new Date(),
    },
    { where }
  );

  return count;
}
