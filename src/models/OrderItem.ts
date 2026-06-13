import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface OrderItemAttributes {
  id: string;
  order_id: string;
  account_id: string;
  asin: string | null;
  sku: string | null;
  title: string | null;
  quantity: number | null;
  item_price: number | null;
  item_tax: number | null;
  promotion_discount: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export type OrderItemCreationAttributes = Optional<
  OrderItemAttributes,
  'id' | 'asin' | 'sku' | 'title' | 'quantity' | 'item_price' | 'item_tax' | 'promotion_discount'
>;

export class OrderItem
  extends Model<OrderItemAttributes, OrderItemCreationAttributes>
  implements OrderItemAttributes
{
  declare id: string;
  declare order_id: string;
  declare account_id: string;
  declare asin: string | null;
  declare sku: string | null;
  declare title: string | null;
  declare quantity: number | null;
  declare item_price: number | null;
  declare item_tax: number | null;
  declare promotion_discount: number | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initOrderItemModel(sequelize: Sequelize): typeof OrderItem {
  OrderItem.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      order_id: { type: DataTypes.UUID, allowNull: false },
      account_id: { type: DataTypes.UUID, allowNull: false },
      asin: { type: DataTypes.STRING(20), allowNull: true },
      sku: { type: DataTypes.STRING(100), allowNull: true },
      title: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: true },
      item_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      item_tax: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      promotion_discount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    },
    { sequelize, tableName: 'order_items', underscored: true }
  );
  return OrderItem;
}
