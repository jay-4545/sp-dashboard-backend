import { env } from './index';

export const AMAZON_LWA_URL = 'https://api.amazon.com/auth/o2/token';

export type SpApiRegion = 'NA' | 'EU' | 'FE' | 'IN';

export const SP_API_ENDPOINTS: Record<SpApiRegion, string> = {
  NA: 'https://sellingpartnerapi-na.amazon.com',
  EU: 'https://sellingpartnerapi-eu.amazon.com',
  FE: 'https://sellingpartnerapi-fe.amazon.com',
  IN: 'https://sellingpartnerapi-eu.amazon.com',
};

export const SP_API_SANDBOX_ENDPOINTS: Record<SpApiRegion, string> = {
  NA: 'https://sandbox.sellingpartnerapi-na.amazon.com',
  EU: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
  FE: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
  IN: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
};

export function getSigningRegion(region: SpApiRegion): string {
  if (region === 'EU' || region === 'IN') return 'eu-west-1';
  if (region === 'FE') return 'us-west-2';
  return 'us-east-1';
}

export const amazonConfig = {
  clientId: env.AMAZON_CLIENT_ID,
  clientSecret: env.AMAZON_CLIENT_SECRET,
  region: env.AMAZON_REGION,
  lwaUrl: AMAZON_LWA_URL,
  getEndpoint(region: SpApiRegion): string {
    return SP_API_ENDPOINTS[region] || SP_API_ENDPOINTS.NA;
  },
};