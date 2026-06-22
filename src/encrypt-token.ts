import dotenv from 'dotenv';
import { encrypt } from './utils/encrypt';

dotenv.config();

const refreshToken = process.env.REFRESH_TOKEN;
if (!refreshToken) {
  console.error('REFRESH_TOKEN is not set in .env');
  process.exit(1);
}

console.log(encrypt(refreshToken));
