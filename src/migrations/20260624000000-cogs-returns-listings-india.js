'use strict';

/**
 * Migration: COGS / profit-loss / returns / listing-detail / India-only.
 *
 * Aa migration:
 *   1. `product_costs` table banave (COGS history).
 *   2. `products` ma listing-detail columns ume (price, mrp, qty, image...).
 *      listing_status ne STRING mathi JSONB (array) ma convert kare.
 *   3. `orders` ma return tracking columns ume (is_refunded, refund_amount, cogs_lost).
 *   4. `order_items` ma COGS snapshot columns ume (unit_cost, total_cost, is_returned).
 *   5. India-only: region ENUM → VARCHAR(2), badha non-IN → IN.
 *
 * Existing migrations sathe compatibility:
 *   - 20240601: badha base tables banaya (orders, products, seller_accounts...)
 *   - 20240602: refresh_tokens table
 *   - 20240603: `ALTER TYPE seller_region ADD VALUE 'IN'` — etle DB ma
 *     enum_seller_accounts_region type haji exist kare chhe (NA|EU|FE|IN sathe).
 *     Aapni migration e type ne properly drop karva correct sequence vaapre chhe:
 *     ENUM→TEXT (explicit cast) → DROP TYPE → VARCHAR(2) → UPDATE → DEFAULT.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ---------------------------------------------------------------
    // 1. product_costs
    // ---------------------------------------------------------------
    await queryInterface.createTable('product_costs', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      sku: { type: DataTypes.STRING(100), allowNull: false },
      asin: { type: DataTypes.STRING(20), allowNull: true },
      unit_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      shipping_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      packaging_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
      effective_from: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      effective_to: { type: DataTypes.DATE, allowNull: true },
      note: { type: DataTypes.STRING(255), allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('product_costs', ['account_id', 'sku']);
    await queryInterface.addIndex('product_costs', ['account_id', 'sku', 'effective_from']);

    // ---------------------------------------------------------------
    // 2. products — listing detail columns
    // ---------------------------------------------------------------
    await queryInterface.addColumn('products', 'product_type', {
      type: DataTypes.STRING(80),
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'condition_type', {
      type: DataTypes.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'selling_price', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'mrp', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'quantity', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'currency', {
      type: DataTypes.CHAR(3),
      allowNull: true,
    });
    await queryInterface.addColumn('products', 'main_image', {
      type: DataTypes.TEXT,
      allowNull: true,
    });

    // listing_status: VARCHAR → JSONB array
    // Existing string values (e.g. "Active") ne single-element array ma wrap karo.
    await queryInterface.sequelize.query(`
      ALTER TABLE products
      ALTER COLUMN listing_status TYPE JSONB
      USING CASE
        WHEN listing_status IS NULL THEN NULL
        ELSE to_jsonb(ARRAY[listing_status])
      END;
    `);

    // ---------------------------------------------------------------
    // 3. orders — return/refund tracking
    // ---------------------------------------------------------------
    await queryInterface.addColumn('orders', 'is_refunded', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('orders', 'refund_amount', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('orders', 'cogs_lost', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });

    // ---------------------------------------------------------------
    // 4. order_items — COGS snapshot
    // ---------------------------------------------------------------
    await queryInterface.addColumn('order_items', 'unit_cost', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('order_items', 'total_cost', {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('order_items', 'is_returned', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // ---------------------------------------------------------------
    // 5. India-only — region ENUM → VARCHAR(2), data → IN
    //
    // 20240603 migration e `ALTER TYPE seller_region ADD VALUE 'IN'` chalyu chhe.
    // Etle DB ma enum_seller_accounts_region type haji chhe (NA|EU|FE|IN).
    // Aa type ne safely remove karva correct 3-step sequence:
    //
    //   Step A: ENUM column → TEXT  (USING ::text — Postgres requirement)
    //   Step B: enum type drop       (column havi depend nathi karto)
    //   Step C: TEXT → VARCHAR(2)    (trivial, no cast)
    //   Step D: Data update           (non-IN → IN)
    //   Step E: Default set
    // ---------------------------------------------------------------

    // Step A: column ne TEXT ma convert (explicit ::text cast mandatory)
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts
      ALTER COLUMN region TYPE TEXT
      USING region::text;
    `);

    // Step B: hve column depend nathi karto → type safely drop
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS enum_seller_accounts_region;
      EXCEPTION WHEN others THEN
        NULL;
      END $$;
    `);

    // Step C: TEXT → VARCHAR(2)
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts
      ALTER COLUMN region TYPE VARCHAR(2)
      USING region;
    `);

    // Step D: badha non-IN accounts → IN  (India-only deployment)
    await queryInterface.sequelize.query(`
      UPDATE seller_accounts SET region = 'IN' WHERE region <> 'IN';
    `);

    // Step E: future rows default IN
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts ALTER COLUMN region SET DEFAULT 'IN';
    `);

    // marketplace_id default → Amazon.in
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts ALTER COLUMN marketplace_id SET DEFAULT 'A21TJRUUN4KGV';
    `);
  },

  async down(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // 4. order_items rollback
    await queryInterface.removeColumn('order_items', 'unit_cost');
    await queryInterface.removeColumn('order_items', 'total_cost');
    await queryInterface.removeColumn('order_items', 'is_returned');

    // 3. orders rollback
    await queryInterface.removeColumn('orders', 'is_refunded');
    await queryInterface.removeColumn('orders', 'refund_amount');
    await queryInterface.removeColumn('orders', 'cogs_lost');

    // 2. products rollback — JSONB → VARCHAR
    await queryInterface.sequelize.query(`
      ALTER TABLE products
      ALTER COLUMN listing_status TYPE VARCHAR(50)
      USING CASE
        WHEN listing_status IS NULL THEN NULL
        ELSE (listing_status->>0)
      END;
    `);
    await queryInterface.removeColumn('products', 'product_type');
    await queryInterface.removeColumn('products', 'condition_type');
    await queryInterface.removeColumn('products', 'selling_price');
    await queryInterface.removeColumn('products', 'mrp');
    await queryInterface.removeColumn('products', 'quantity');
    await queryInterface.removeColumn('products', 'currency');
    await queryInterface.removeColumn('products', 'main_image');

    // 1. product_costs rollback
    await queryInterface.dropTable('product_costs');

    // 5. region rollback — VARCHAR → ENUM (recreate original type)
    await queryInterface.sequelize.query(`
      CREATE TYPE enum_seller_accounts_region AS ENUM ('NA', 'EU', 'FE', 'IN');
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts
      ALTER COLUMN region TYPE enum_seller_accounts_region
      USING region::enum_seller_accounts_region;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts ALTER COLUMN region SET DEFAULT 'NA';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_accounts ALTER COLUMN marketplace_id DROP DEFAULT;
    `);
  },
};