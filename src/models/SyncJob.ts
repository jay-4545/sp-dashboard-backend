import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export type SyncType = 'orders' | 'inventory' | 'finance' | 'reports' | 'listings' | 'products';
export type SyncJobStatus = 'running' | 'success' | 'failed';

export interface SyncJobAttributes {
  id: string;
  account_id: string;
  sync_type: SyncType;
  status: SyncJobStatus;
  records_synced: number;
  error_message: string | null;
  started_at: Date;
  finished_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type SyncJobCreationAttributes = Optional<
  SyncJobAttributes,
  'id' | 'status' | 'records_synced' | 'error_message' | 'started_at' | 'finished_at'
>;

export class SyncJob extends Model<SyncJobAttributes, SyncJobCreationAttributes> implements SyncJobAttributes {
  declare id: string;
  declare account_id: string;
  declare sync_type: SyncType;
  declare status: SyncJobStatus;
  declare records_synced: number;
  declare error_message: string | null;
  declare started_at: Date;
  declare finished_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initSyncJobModel(sequelize: Sequelize): typeof SyncJob {
  SyncJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      sync_type: {
        type: DataTypes.ENUM('orders', 'inventory', 'finance', 'reports', 'listings', 'products'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('running', 'success', 'failed'),
        allowNull: false,
        defaultValue: 'running',
      },
      records_synced: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      finished_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, tableName: 'sync_jobs', underscored: true }
  );
  return SyncJob;
}
