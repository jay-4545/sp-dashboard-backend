import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface FinancialEventAttributes {
  id: string;
  account_id: string;
  amazon_order_id: string | null;
  event_type: string | null;
  amount: number | null;
  currency: string | null;
  fee_type: string | null;
  posted_date: Date | null;
  raw_data: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export type FinancialEventCreationAttributes = Optional<
  FinancialEventAttributes,
  'id' | 'amazon_order_id' | 'event_type' | 'amount' | 'currency' | 'fee_type' | 'posted_date' | 'raw_data'
>;

export class FinancialEvent
  extends Model<FinancialEventAttributes, FinancialEventCreationAttributes>
  implements FinancialEventAttributes
{
  declare id: string;
  declare account_id: string;
  declare amazon_order_id: string | null;
  declare event_type: string | null;
  declare amount: number | null;
  declare currency: string | null;
  declare fee_type: string | null;
  declare posted_date: Date | null;
  declare raw_data: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initFinancialEventModel(sequelize: Sequelize): typeof FinancialEvent {
  FinancialEvent.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      amazon_order_id: { type: DataTypes.STRING(50), allowNull: true },
      event_type: { type: DataTypes.STRING(50), allowNull: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      currency: { type: DataTypes.CHAR(3), allowNull: true },
      fee_type: { type: DataTypes.STRING(80), allowNull: true },
      posted_date: { type: DataTypes.DATE, allowNull: true },
      raw_data: { type: DataTypes.JSONB, allowNull: true },
    },
    { sequelize, tableName: 'financial_events', underscored: true }
  );
  return FinancialEvent;
}
