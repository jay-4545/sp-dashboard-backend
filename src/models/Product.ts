import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

/**
 * Product = ek Amazon listing. Pehla fakt asin/sku/title/status hata.
 * Have listing nu pura data store kariye chie jethi UI ma proper dekhay:
 *   - selling_price : aapne je price e vechiye chie (our_price, value_with_tax)
 *   - mrp           : maximum retail price (strike-through price)
 *   - quantity      : fulfillment availability quantity
 *   - main_image    : thumbnail URL
 *   - product_type  : Amazon product type (e.g. UTILITY_KNIFE)
 *   - condition     : new_new etc.
 * listing_status array tarike store thay che (DISCOVERABLE, BUYABLE...).
 */

export interface ProductAttributes {
  id: string;
  account_id: string;
  asin: string;
  sku: string | null;
  title: string | null;
  listing_status: string[] | null;
  product_type: string | null;
  condition_type: string | null;
  selling_price: number | null;
  mrp: number | null;
  quantity: number | null;
  currency: string | null;
  main_image: string | null;
  raw_data: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ProductCreationAttributes = Optional<
  ProductAttributes,
  | 'id'
  | 'sku'
  | 'title'
  | 'listing_status'
  | 'product_type'
  | 'condition_type'
  | 'selling_price'
  | 'mrp'
  | 'quantity'
  | 'currency'
  | 'main_image'
  | 'raw_data'
>;

export class Product extends Model<ProductAttributes, ProductCreationAttributes> implements ProductAttributes {
  declare id: string;
  declare account_id: string;
  declare asin: string;
  declare sku: string | null;
  declare title: string | null;
  declare listing_status: string[] | null;
  declare product_type: string | null;
  declare condition_type: string | null;
  declare selling_price: number | null;
  declare mrp: number | null;
  declare quantity: number | null;
  declare currency: string | null;
  declare main_image: string | null;
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
      listing_status: { type: DataTypes.JSONB, allowNull: true },
      product_type: { type: DataTypes.STRING(80), allowNull: true },
      condition_type: { type: DataTypes.STRING(40), allowNull: true },
      selling_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      mrp: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: true },
      currency: { type: DataTypes.CHAR(3), allowNull: true },
      main_image: { type: DataTypes.TEXT, allowNull: true },
      raw_data: { type: DataTypes.JSONB, allowNull: true },
    },
    { sequelize, tableName: 'products', underscored: true }
  );
  return Product;
}