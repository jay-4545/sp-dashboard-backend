import { Sequelize } from 'sequelize';
import { sequelize } from '../config/database';
import { initUserModel, User } from './User';
import { initSellerAccountModel, SellerAccount } from './SellerAccount';
import { initOrderModel, Order } from './Order';
import { initOrderItemModel, OrderItem } from './OrderItem';
import { initInventorySnapshotModel, InventorySnapshot } from './InventorySnapshot';
import { initFinancialEventModel, FinancialEvent } from './FinancialEvent';
import { initProductModel, Product } from './Product';
import { initSyncJobModel, SyncJob } from './SyncJob';

export function initModels(db: Sequelize = sequelize) {
  initUserModel(db);
  initSellerAccountModel(db);
  initOrderModel(db);
  initOrderItemModel(db);
  initInventorySnapshotModel(db);
  initFinancialEventModel(db);
  initProductModel(db);
  initSyncJobModel(db);

  SellerAccount.hasMany(Order, { foreignKey: 'account_id', as: 'orders' });
  Order.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
  OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

  SellerAccount.hasMany(OrderItem, { foreignKey: 'account_id', as: 'orderItems' });
  OrderItem.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  SellerAccount.hasMany(InventorySnapshot, { foreignKey: 'account_id', as: 'inventorySnapshots' });
  InventorySnapshot.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  SellerAccount.hasMany(FinancialEvent, { foreignKey: 'account_id', as: 'financialEvents' });
  FinancialEvent.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  SellerAccount.hasMany(Product, { foreignKey: 'account_id', as: 'products' });
  Product.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  SellerAccount.hasMany(SyncJob, { foreignKey: 'account_id', as: 'syncJobs' });
  SyncJob.belongsTo(SellerAccount, { foreignKey: 'account_id', as: 'account' });

  return {
    User,
    SellerAccount,
    Order,
    OrderItem,
    InventorySnapshot,
    FinancialEvent,
    Product,
    SyncJob,
  };
}

const models = initModels();

export default models;
export {
  User,
  SellerAccount,
  Order,
  OrderItem,
  InventorySnapshot,
  FinancialEvent,
  Product,
  SyncJob,
};
export type { SyncType, SyncJobStatus } from './SyncJob';
