'use strict';

const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);

    await queryInterface.bulkInsert('users', [
      {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@example.com',
        password_hash: passwordHash,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'viewer@example.com',
        password_hash: passwordHash,
        role: 'viewer',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const accounts = [
      { name: 'Brand A', seller_id: 'SELLER_A_001', marketplace_id: 'ATVPDKIKX0DER' },
      { name: 'Brand B', seller_id: 'SELLER_B_002', marketplace_id: 'ATVPDKIKX0DER' },
      { name: 'Brand C', seller_id: 'SELLER_C_003', marketplace_id: 'ATVPDKIKX0DER' },
      { name: 'Brand D', seller_id: 'SELLER_D_004', marketplace_id: 'ATVPDKIKX0DER' },
      { name: 'Brand E', seller_id: 'SELLER_E_005', marketplace_id: 'ATVPDKIKX0DER' },
    ];

    await queryInterface.bulkInsert(
      'seller_accounts',
      accounts.map((a, i) => ({
        id: `00000000-0000-0000-0001-00000000000${i + 1}`,
        name: a.name,
        seller_id: a.seller_id,
        marketplace_id: a.marketplace_id,
        region: 'NA',
        refresh_token: null,
        access_token: null,
        token_expires_at: null,
        is_active: true,
        last_synced_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }))
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('seller_accounts', null, {});
    await queryInterface.bulkDelete('users', null, {});
  },
};
