import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export type SellerRegion = 'NA' | 'EU' | 'FE' | 'IN';

export interface SellerAccountAttributes {
  id: string;
  name: string;
  seller_id: string;
  marketplace_id: string;
  region: SellerRegion;
  refresh_token: string | null;
  access_token: string | null;
  token_expires_at: Date | null;
  is_active: boolean;
  last_synced_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type SellerAccountCreationAttributes = Optional<
  SellerAccountAttributes,
  'id' | 'refresh_token' | 'access_token' | 'token_expires_at' | 'is_active' | 'last_synced_at'
>;

export class SellerAccount
  extends Model<SellerAccountAttributes, SellerAccountCreationAttributes>
  implements SellerAccountAttributes
{
  declare id: string;
  declare name: string;
  declare seller_id: string;
  declare marketplace_id: string;
  declare region: SellerRegion;
  declare refresh_token: string | null;
  declare access_token: string | null;
  declare token_expires_at: Date | null;
  declare is_active: boolean;
  declare last_synced_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initSellerAccountModel(sequelize: Sequelize): typeof SellerAccount {
  SellerAccount.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(100), allowNull: false },
      seller_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      marketplace_id: { type: DataTypes.STRING(50), allowNull: false },
      region: {
        type: DataTypes.ENUM('NA', 'EU', 'FE', 'IN'),
        allowNull: false, 
        defaultValue: 'NA',
      },
      refresh_token: { type: DataTypes.TEXT, allowNull: true },
      access_token: { type: DataTypes.TEXT, allowNull: true },
      token_expires_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      last_synced_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, tableName: 'seller_accounts', underscored: true }
  );
  return SellerAccount;
}
