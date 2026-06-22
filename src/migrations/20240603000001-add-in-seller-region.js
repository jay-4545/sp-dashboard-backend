'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE seller_region ADD VALUE IF NOT EXISTS 'IN'`
    );
  },

  async down() {
    // PostgreSQL does not support removing enum values without recreating the type.
  },
};
