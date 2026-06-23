/**
 * Marks stuck `running` sync jobs as failed so new syncs can start.
 *
 * Usage:
 *   npm run reset-stuck-sync
 *   npm run reset-stuck-sync -- --sync-type=finance
 *   npm run reset-stuck-sync -- --account-id=<uuid>
 */
import dotenv from 'dotenv';
import { connectDatabase, sequelize } from './config/database';
import { resetStuckSyncJobs } from './services/sync/syncJobUtils';
import { SyncType } from './models/SyncJob';

dotenv.config();

const SYNC_TYPES: SyncType[] = ['orders', 'inventory', 'finance', 'reports', 'listings'];

function parseArgs(argv: string[]) {
  const accountArg = argv.find((arg) => arg.startsWith('--account-id='));
  const syncArg = argv.find((arg) => arg.startsWith('--sync-type='));
  const accountId = accountArg ? accountArg.split('=')[1]?.trim() : undefined;
  const syncTypeRaw = syncArg ? syncArg.split('=')[1]?.trim() : undefined;

  if (syncTypeRaw && !SYNC_TYPES.includes(syncTypeRaw as SyncType)) {
    console.error(`Invalid --sync-type. Use one of: ${SYNC_TYPES.join(', ')}`);
    process.exit(1);
  }

  return {
    accountId,
    syncType: syncTypeRaw as SyncType | undefined,
  };
}

async function main() {
  const { accountId, syncType } = parseArgs(process.argv.slice(2));
  await connectDatabase();

  const count = await resetStuckSyncJobs({ accountId, syncType });
  console.log(`Reset ${count} stuck sync job(s).`);
  if (count > 0) {
    console.log('You can run Finance sync again from the Accounts page.');
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
