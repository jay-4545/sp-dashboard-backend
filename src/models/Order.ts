import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export type FulfillmentChannel = 'FBA' | 'FBM';

export interface OrderAttributes {
  id: string;
  account_id: string;
  amazon_order_id: string;
  status: string | null;
  marketplace_id: string | null;
  order_total: number | null;
  currency: string | null;
  fulfillment_channel: FulfillmentChannel | null;
  purchase_date: Date | null;
  raw_data: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export type OrderCreationAttributes = Optional<
  OrderAttributes,
  'id' | 'status' | 'marketplace_id' | 'order_total' | 'currency' | 'fulfillment_channel' | 'purchase_date' | 'raw_data'
>;

export class Order extends Model<OrderAttributes, OrderCreationAttributes> implements OrderAttributes {
  declare id: string;
  declare account_id: string;
  declare amazon_order_id: string;
  declare status: string | null;
  declare marketplace_id: string | null;
  declare order_total: number | null;
  declare currency: string | null;
  declare fulfillment_channel: FulfillmentChannel | null;
  declare purchase_date: Date | null;
  declare raw_data: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initOrderModel(sequelize: Sequelize): typeof Order {
  Order.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      amazon_order_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      status: { type: DataTypes.STRING(30), allowNull: true },
      marketplace_id: { type: DataTypes.STRING(50), allowNull: true },
      order_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      currency: { type: DataTypes.CHAR(3), allowNull: true },
      fulfillment_channel: { type: DataTypes.ENUM('FBA', 'FBM'), allowNull: true },
      purchase_date: { type: DataTypes.DATE, allowNull: true },
      raw_data: { type: DataTypes.JSONB, allowNull: true },
    },
    { sequelize, tableName: 'orders', underscored: true }
  );
  return Order;
}
