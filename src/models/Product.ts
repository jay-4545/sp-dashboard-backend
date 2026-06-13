import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

export interface ProductAttributes {
  id: string;
  account_id: string;
  asin: string;
  sku: string | null;
  title: string | null;
  listing_status: string | null;
  raw_data: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ProductCreationAttributes = Optional<
  ProductAttributes,
  'id' | 'sku' | 'title' | 'listing_status' | 'raw_data'
>;

export class Product extends Model<ProductAttributes, ProductCreationAttributes> implements ProductAttributes {
  declare id: string;
  declare account_id: string;
  declare asin: string;
  declare sku: string | null;
  declare title: string | null;
  declare listing_status: string | null;
  declare raw_data: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initProductModel(sequelize: Sequelize): typeof Product {
  Product.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      asin: { type: DataTypes.STRING(20), allowNull: false },
      sku: { type: DataTypes.STRING(100), allowNull: true },
      title: { type: DataTypes.TEXT, allowNull: true },
      listing_status: { type: DataTypes.STRING(50), allowNull: true },
      raw_data: { type: DataTypes.JSONB, allowNull: true },
    },
    { sequelize, tableName: 'products', underscored: true }
  );
  return Product;
}
