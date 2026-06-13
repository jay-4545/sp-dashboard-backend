'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TYPE user_role AS ENUM ('admin', 'viewer');
      CREATE TYPE seller_region AS ENUM ('NA', 'EU', 'FE');
      CREATE TYPE fulfillment_channel AS ENUM ('FBA', 'FBM');
      CREATE TYPE sync_type AS ENUM ('orders', 'inventory', 'finance', 'reports', 'listings');
      CREATE TYPE sync_status AS ENUM ('running', 'success', 'failed');
    `);

    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      role: {
        type: 'user_role',
        allowNull: false,
        defaultValue: 'viewer',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.createTable('seller_accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      seller_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      marketplace_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      region: {
        type: 'seller_region',
        allowNull: false,
        defaultValue: 'NA',
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      amazon_order_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      marketplace_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      order_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      currency: {
        type: Sequelize.CHAR(3),
        allowNull: true,
      },
      fulfillment_channel: {
        type: 'fulfillment_channel',
        allowNull: true,
      },
      purchase_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      raw_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('orders', ['account_id', 'purchase_date']);
    await queryInterface.addIndex('orders', ['account_id', 'amazon_order_id']);

    await queryInterface.createTable('order_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      asin: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      sku: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      title: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      item_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      item_tax: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      promotion_discount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('order_items', ['account_id', 'sku']);

    await queryInterface.createTable('inventory_snapshots', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      asin: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      sku: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      fnsku: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      sellable_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      unsellable_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      reserved_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      inbound_qty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      snapshotted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('inventory_snapshots', ['account_id', 'asin', 'snapshotted_at']);

    await queryInterface.createTable('financial_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      amazon_order_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      currency: {
        type: Sequelize.CHAR(3),
        allowNull: true,
      },
      fee_type: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      posted_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      raw_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('financial_events', ['account_id', 'posted_date']);

    await queryInterface.createTable('products', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      asin: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      sku: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      title: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      listing_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      raw_data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('products', ['account_id', 'asin'], { unique: true });

    await queryInterface.createTable('sync_jobs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'seller_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      sync_type: {
        type: 'sync_type',
        allowNull: false,
      },
      status: {
        type: 'sync_status',
        allowNull: false,
        defaultValue: 'running',
      },
      records_synced: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('sync_jobs', ['account_id', 'sync_type', 'started_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_jobs');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('financial_events');
    await queryInterface.dropTable('inventory_snapshots');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
    await queryInterface.dropTable('seller_accounts');
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS sync_status;
      DROP TYPE IF EXISTS sync_type;
      DROP TYPE IF EXISTS fulfillment_channel;
      DROP TYPE IF EXISTS seller_region;
      DROP TYPE IF EXISTS user_role;
    `);
  },
};
