/**
 * Deletes all rows from financial_events (optionally for one account).
 *
 * Usage:
 *   npm run clear-finance -- --confirm
 *   npm run clear-finance -- --confirm --account-id=<uuid>
 */
import dotenv from 'dotenv';
import { connectDatabase, sequelize } from './config/database';
import { FinancialEvent, SellerAccount } from './models';

dotenv.config();

function parseArgs(argv: string[]) {
  const confirm = argv.includes('--confirm');
  const accountArg = argv.find((arg) => arg.startsWith('--account-id='));
  const accountId = accountArg ? accountArg.split('=')[1]?.trim() : undefined;
  return { confirm, accountId };
}

async function main() {
  const { confirm, accountId } = parseArgs(process.argv.slice(2));

  if (!confirm) {
    console.error(
      'This will permanently delete finance data from financial_events.\n' +
        'Re-run with --confirm to proceed:\n\n' +
        '  npm run clear-finance -- --confirm\n' +
        '  npm run clear-finance -- --confirm --account-id=<account-uuid>\n'
    );
    process.exit(1);
  }

  await connectDatabase();

  if (accountId) {
    const account = await SellerAccount.findByPk(accountId, { attributes: ['id', 'name'] });
    if (!account) {
      console.error(`Account not found: ${accountId}`);
      process.exit(1);
    }
    console.log(`Account: ${account.name} (${account.id})`);
  } else {
    console.log('Scope: ALL accounts');
  }

  const where = accountId ? { account_id: accountId } : {};
  const count = await FinancialEvent.count({ where });
  console.log(`Rows to delete: ${count}`);

  if (count === 0) {
    console.log('Nothing to delete.');
    await sequelize.close();
    return;
  }

  if (accountId) {
    await FinancialEvent.destroy({ where });
  } else {
    await FinancialEvent.truncate();
  }

  const remaining = await FinancialEvent.count({ where });
  console.log(`Done. Remaining rows: ${remaining}`);
  console.log('Run Finance sync from Accounts page to pull fresh data from Amazon.');

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
