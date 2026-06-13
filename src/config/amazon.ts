import { env } from './index';

export const AMAZON_LWA_URL = 'https://api.amazon.com/auth/o2/token';

export const SP_API_ENDPOINTS: Record<string, string> = {
  NA: 'https://sellingpartnerapi-na.amazon.com',
  EU: 'https://sellingpartnerapi-eu.amazon.com',
  FE: 'https://sellingpartnerapi-fe.amazon.com',
};

export const amazonConfig = {
  clientId: env.AMAZON_CLIENT_ID,
  clientSecret: env.AMAZON_CLIENT_SECRET,
  region: env.AMAZON_REGION,
  lwaUrl: AMAZON_LWA_URL,
  getEndpoint(region: 'NA' | 'EU' | 'FE'): string {
    return SP_API_ENDPOINTS[region] || SP_API_ENDPOINTS.NA;
  },
};
