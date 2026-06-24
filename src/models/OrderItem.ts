import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

/**
 * OrderItem ma have COGS snapshot store thay che. Jyare order sync thay tyare
 * te SKU no je cost order ni purchase_date par effective hato te `unit_cost`
 * ma copy thay che. Aathi pachhi cost badle to pan juna order no profit
 * badlato nathi (point-in-time accurate accounting).
 *
 *   - unit_cost   : per-unit landed COGS (snapshot).
 *   - total_cost  : unit_cost * quantity.
 *   - is_returned : aa item return/refund thayu che?
 */
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
  unit_cost: number | null;
  total_cost: number | null;
  is_returned: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type OrderItemCreationAttributes = Optional<
  OrderItemAttributes,
  | 'id'
  | 'asin'
  | 'sku'
  | 'title'
  | 'quantity'
  | 'item_price'
  | 'item_tax'
  | 'promotion_discount'
  | 'unit_cost'
  | 'total_cost'
  | 'is_returned'
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
  declare unit_cost: number | null;
  declare total_cost: number | null;
  declare is_returned: boolean;
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
      unit_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      total_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      is_returned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { sequelize, tableName: 'order_items', underscored: true }
  );
  return OrderItem;
}