import { Model, DataTypes, Optional, Sequelize } from 'sequelize';

/**
 * ProductCost — per-SKU cost of goods (COGS) with effective-dated history.
 *
 * Best-practice accounting: ek SKU no cost time sathe badlay che (supplier
 * price change, bulk discount, etc). Etle aapne single `cost_price` column
 * Product ma na rakhta, ek alag history table rakhie chie. Profit ganva vakhate
 * order ni purchase_date par je cost EFFECTIVE hato te vapraay che.
 *
 * Columns:
 *   - unit_cost       : ek unit kharidva no kharcho (landed cost — see below).
 *   - shipping_cost   : per-unit inbound/logistics cost (optional).
 *   - packaging_cost  : per-unit packaging cost (optional).
 *   - effective_from  : aa cost kai date thi lagu pade.
 *   - effective_to    : null = atyare active; non-null = aa date sudhi j hato.
 *
 * `landed_cost` = unit_cost + shipping_cost + packaging_cost (computed getter).
 * Aa j value profit/loss ane return-cost calculation ma COGS tarike vaparay che.
 */

export interface ProductCostAttributes {
  id: string;
  account_id: string;
  sku: string;
  asin: string | null;
  unit_cost: number;
  shipping_cost: number;
  packaging_cost: number;
  currency: string;
  effective_from: Date;
  effective_to: Date | null;
  note: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ProductCostCreationAttributes = Optional<
  ProductCostAttributes,
  | 'id'
  | 'asin'
  | 'shipping_cost'
  | 'packaging_cost'
  | 'currency'
  | 'effective_from'
  | 'effective_to'
  | 'note'
>;

export class ProductCost
  extends Model<ProductCostAttributes, ProductCostCreationAttributes>
  implements ProductCostAttributes
{
  declare id: string;
  declare account_id: string;
  declare sku: string;
  declare asin: string | null;
  declare unit_cost: number;
  declare shipping_cost: number;
  declare packaging_cost: number;
  declare currency: string;
  declare effective_from: Date;
  declare effective_to: Date | null;
  declare note: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  /** Total per-unit cost used as COGS in every profit/return calculation. */
  get landed_cost(): number {
    return (
      Number(this.unit_cost) +
      Number(this.shipping_cost) +
      Number(this.packaging_cost)
    );
  }
}

export function initProductCostModel(sequelize: Sequelize): typeof ProductCost {
  ProductCost.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      account_id: { type: DataTypes.UUID, allowNull: false },
      sku: { type: DataTypes.STRING(100), allowNull: false },
      asin: { type: DataTypes.STRING(20), allowNull: true },
      unit_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      shipping_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      packaging_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
      effective_from: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      effective_to: { type: DataTypes.DATE, allowNull: true },
      note: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      sequelize,
      tableName: 'product_costs',
      underscored: true,
      indexes: [
        { fields: ['account_id', 'sku'] },
        { fields: ['account_id', 'sku', 'effective_from'] },
      ],
    }
  );
  return ProductCost;
}