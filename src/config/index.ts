import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(32),
  AMAZON_CLIENT_ID: z.string().optional().default(''),
  AMAZON_CLIENT_SECRET: z.string().optional().default(''),
  AMAZON_REGION: z.string().default('us-east-1'),
  FRONTEND_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export function isAmazonConfigured(): boolean {
  return Boolean(env.AMAZON_CLIENT_ID && env.AMAZON_CLIENT_SECRET);
}
