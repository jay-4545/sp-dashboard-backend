/**
 * Deletes sync_jobs records for a specific sync_type (or all types).
 *
 * Usage:
 *   npx tsx src/clear-sync-jobs.ts orders
 *   npx tsx src/clear-sync-jobs.ts all
 */
import dotenv from 'dotenv';
import { connectDatabase, sequelize } from './config/database';
import { SyncJob } from './models';

dotenv.config();

async function main() {
  const syncType = process.argv[2];
  if (!syncType) {
    console.error('Usage: npx tsx src/clear-sync-jobs.ts <sync_type|all>');
    process.exit(1);
  }

  await connectDatabase();

  let deleted: number;
  if (syncType === 'all') {
    deleted = await SyncJob.destroy({ where: {}, truncate: true } as never);
    console.log(`Deleted ALL sync jobs`);
  } else {
    deleted = await SyncJob.destroy({ where: { sync_type: syncType } });
    console.log(`Deleted ${deleted} sync_jobs with sync_type='${syncType}'`);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
