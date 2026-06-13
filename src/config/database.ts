import { Sequelize } from 'sequelize';
import { env } from './index';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: env.NODE_ENV === 'production' || env.DATABASE_URL.includes('neon.tech')
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
}
