/**
 * Deletes all rows from order_items and orders (optionally for one account).
 *
 * Usage:
 *   npm run clear-orders -- --confirm
 *   npm run clear-orders -- --confirm --account-id=<uuid>
 */
import dotenv from 'dotenv';
import { connectDatabase, sequelize } from './config/database';
import { Order, OrderItem, SellerAccount } from './models';

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
      'This will permanently delete order data from order_items and orders.\n' +
        'Re-run with --confirm to proceed:\n\n' +
        '  npm run clear-orders -- --confirm\n' +
        '  npm run clear-orders -- --confirm --account-id=<account-uuid>\n'
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
  const itemCount = await OrderItem.count({ where });
  const orderCount = await Order.count({ where });
  console.log(`Orders to delete: ${orderCount}`);
  console.log(`Order items to delete: ${itemCount}`);

  if (orderCount === 0 && itemCount === 0) {
    console.log('Nothing to delete.');
    await sequelize.close();
    return;
  }

  if (accountId) {
    await OrderItem.destroy({ where });
    await Order.destroy({ where });
  } else {
    await sequelize.query('TRUNCATE TABLE order_items, orders RESTART IDENTITY CASCADE');
  }

  const remainingOrders = await Order.count({ where });
  const remainingItems = await OrderItem.count({ where });
  console.log(`Done. Remaining orders: ${remainingOrders}, order items: ${remainingItems}`);
  console.log('Run Orders sync from Accounts page to pull fresh data from Amazon.');

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
