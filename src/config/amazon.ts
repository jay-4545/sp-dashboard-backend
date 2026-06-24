import { env } from './index';

export const AMAZON_LWA_URL = 'https://api.amazon.com/auth/o2/token';

/**
 * India-only deployment. Fakt IN region rakhyu che; NA/EU/FE kaadhi naakhya.
 * Amazon.in EU endpoint par serve thay che, signing region eu-west-1.
 */
export type SpApiRegion = 'IN';

export const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

export const SP_API_ENDPOINTS: Record<SpApiRegion, string> = {
  IN: 'https://sellingpartnerapi-eu.amazon.com',
};

export const SP_API_SANDBOX_ENDPOINTS: Record<SpApiRegion, string> = {
  IN: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
};

export function getSigningRegion(_region: SpApiRegion = 'IN'): string {
  // Amazon.in → EU signing region.
  return 'eu-west-1';
}

export const amazonConfig = {
  clientId: env.AMAZON_CLIENT_ID,
  clientSecret: env.AMAZON_CLIENT_SECRET,
  region: env.AMAZON_REGION,
  lwaUrl: AMAZON_LWA_URL,
  marketplaceId: INDIA_MARKETPLACE_ID,
  getEndpoint(_region: SpApiRegion = 'IN'): string {
    return SP_API_ENDPOINTS.IN;
  },
};