'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [results] = await queryInterface.sequelize.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sync_jobs'
        AND column_name = 'sync_type';
    `);

    const col = results[0];
    if (!col) {
      throw new Error('sync_jobs.sync_type column not found');
    }

    console.log('sync_type column info:', col);

    // PostgreSQL enums show as USER-DEFINED with udt_name = type name (e.g. "sync_type"),
    // not "enum_sync_jobs_sync_type" — do not rely on udt_name containing "enum".
    if (col.data_type === 'USER-DEFINED') {
      const enumName = col.udt_name;
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = '${enumName}'
              AND e.enumlabel = 'products'
          ) THEN
            ALTER TYPE "${enumName}" ADD VALUE 'products';
          END IF;
        END $$;
      `);
      console.log(`Added 'products' to enum ${enumName}`);
      return;
    }

    // VARCHAR/TEXT column — widen allowed values via CHECK constraint.
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_sync_type_check;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sync_jobs
      ADD CONSTRAINT sync_jobs_sync_type_check
      CHECK (sync_type IN ('orders', 'inventory', 'finance', 'reports', 'listings', 'products'));
    `);
    console.log("sync_type is VARCHAR — updated CHECK constraint to include 'products'");
  },

  async down(queryInterface) {
    const [results] = await queryInterface.sequelize.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sync_jobs'
        AND column_name = 'sync_type';
    `);

    const col = results[0];
    if (col?.data_type === 'USER-DEFINED') {
      // PostgreSQL does not support removing enum values; no-op on rollback.
      console.log("Enum values cannot be removed — skipping down migration for sync_type enum");
      return;
    }

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_sync_type_check;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE sync_jobs
      ADD CONSTRAINT sync_jobs_sync_type_check
      CHECK (sync_type IN ('orders', 'inventory', 'finance', 'reports', 'listings'));
    `);
  },
};

// ADD VALUE must not run inside a Sequelize transaction on older PostgreSQL versions.
module.exports.transaction = false;
