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
  AMAZON_REDIRECT_URI: z.string().url().optional(),
  BACKEND_URL: z.string().url().optional().default('http://localhost:3001'),
  AWS_ROLE_ARN: z.string().optional().default(''),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  FRONTEND_URL: z.string().url(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  USE_SANDBOX: z.coerce.boolean().default(false),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(7),
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

export function getAmazonRedirectUri(): string {
  return env.AMAZON_REDIRECT_URI || `${env.BACKEND_URL}/api/amazon/callback`;
}

export function isAwsSigningConfigured(): boolean {
  return Boolean(
    env.AWS_ROLE_ARN && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
  );
}

export function isSandbox(): boolean {
  return env.USE_SANDBOX === true;
}