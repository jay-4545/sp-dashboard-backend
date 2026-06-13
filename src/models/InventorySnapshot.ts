import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface InventorySnapshotAttributes {
  id: string;
  account_id: string;
  asin: string | null;
  sku: string | null;
  fnsku: string | null;
  sellable_qty: number;
  unsellable_qty: number;
  reserved_qty: number;
  inbound_qty: number;
  snapshotted_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export type InventorySnapshotCreationAttributes = Optional<
  InventorySnapshotAttributes,
  'id' | 'asin' | 'sku' | 'fnsku' | 'sellable_qty' | 'unsellable_qty' | 'reserved_qty' | 'inbound_qty' | 'snapshotted_at'
>;

export class InventorySnapshot
  extends Model<InventorySnapshotAttributes, InventorySnapshotCreationAttributes>
  implements InventorySnapshotAttributes
{
  declare id: string;
  declare account_id: string;
  declare asin: string | null;
  declare sku: string | null;
  declare fnsku: string | null;
  declare sellable_qty: number;
  declare unsellable_qty: number;
  declare reserved_qty: number;
  declare inbound_qty: number;
  declare snapshotted_at: Date;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initInventorySnapshotModel(sequelize: Sequelize): typeof InventorySnapshot {
  InventorySnapshot.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      asin: { type: DataTypes.STRING(20), allowNull: true },
      sku: { type: DataTypes.STRING(100), allowNull: true },
      fnsku: { type: DataTypes.STRING(20), allowNull: true },
      sellable_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      unsellable_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      reserved_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      inbound_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      snapshotted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'inventory_snapshots', underscored: true }
  );
  return InventorySnapshot;
}
