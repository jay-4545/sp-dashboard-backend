import axios from 'axios';
import jwt from 'jsonwebtoken';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { amazonConfig, AMAZON_LWA_URL } from '../../config/amazon';
import { env, getAmazonRedirectUri, isAmazonConfigured, isAwsSigningConfigured } from '../../config';
import { SellerAccount, SellerRegion } from '../../models/SellerAccount';
import { decrypt, encrypt } from '../../utils/encrypt';
import { logger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import { AppError } from '../../middleware/error.middleware';

interface LwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

let awsCredentialsCache: { credentials: AwsCredentials; expiresAt: number } | null = null;

const SELLER_CENTRAL_URLS: Record<SellerRegion, string> = {
  NA: 'https://sellercentral.amazon.com/apps/authorize/consent',
  EU: 'https://sellercentral-europe.amazon.com/apps/authorize/consent',
  FE: 'https://sellercentral-japan.amazon.com/apps/authorize/consent',
  IN: 'https://sellercentral.amazon.in/apps/authorize/consent', 
};

interface OAuthStatePayload {
  accountId: string;
  nonce: string;
}

interface AuthorizationCodeResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function refreshAccessToken(account: SellerAccount): Promise<string> {
  if (!isAmazonConfigured()) {
    throw new Error('Amazon SP-API credentials not configured');
  }

  if (!account.refresh_token) {
    throw new Error(`No refresh token for account ${account.name}`);
  }

  const cached = tokenCache.get(account.id);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const refreshToken = decrypt(account.refresh_token);

  const response = await withRetry(() =>
    axios.post<LwaTokenResponse>(
      AMAZON_LWA_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: amazonConfig.clientId,
        client_secret: amazonConfig.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );

  const { access_token, expires_in } = response.data;
  const expiresAt = Date.now() + expires_in * 1000;

  tokenCache.set(account.id, { accessToken: access_token, expiresAt });

  await account.update({
    access_token: encrypt(access_token),
    token_expires_at: new Date(expiresAt),
  });

  return access_token;
}

export async function getAccessTokenForAccount(accountId: string): Promise<string> {
  const account = await SellerAccount.findByPk(accountId);
  if (!account) {
    throw new Error('Account not found');
  }
  return refreshAccessToken(account);
}

export async function refreshAllAccountTokens(): Promise<void> {
  if (!isAmazonConfigured()) {
    logger.warn('Skipping token refresh — Amazon credentials not configured');
    return;
  }

  const accounts = await SellerAccount.findAll({ where: { is_active: true } });

  for (const account of accounts) {
    if (!account.refresh_token) {
      logger.warn(`Skipping token refresh for ${account.name} — no refresh token`);
      continue;
    }
    try {
      await refreshAccessToken(account);
      logger.info(`Token refreshed for ${account.name}`);
    } catch (err) {
      logger.error(`Token refresh failed for ${account.name}`, { error: (err as Error).message });
    }
  }
}

export async function getRestrictedDataToken(
  accessToken: string,
  region: 'NA' | 'EU' | 'FE'
): Promise<string> {
  const endpoint = amazonConfig.getEndpoint(region);

  const response = await axios.post(
    `${endpoint}/tokens/2021-03-01/restrictedDataToken`,
    {
      restrictedResources: [
        {
          method: 'GET',
          path: '/orders/v0/orders',
          dataElements: ['buyerInfo', 'shippingAddress'],
        },
      ],
    },
    {
      headers: {
        'x-amz-access-token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.restrictedDataToken;
}

export async function getAwsCredentials(): Promise<AwsCredentials> {
  if (!isAwsSigningConfigured()) {
    return { accessKeyId: '', secretAccessKey: '', sessionToken: '' };
  }

  if (awsCredentialsCache && awsCredentialsCache.expiresAt > Date.now() + 60000) {
    return awsCredentialsCache.credentials;
  }

  const stsClient = new STSClient({
    region: amazonConfig.region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const response = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: env.AWS_ROLE_ARN,
      RoleSessionName: 'sp-api-session',
      DurationSeconds: 3600,
    })
  );

  const credentials = response.Credentials;
  if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
    throw new Error('Failed to assume AWS role for SP-API');
  }

  const result: AwsCredentials = {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
  };

  awsCredentialsCache = {
    credentials: result,
    expiresAt: credentials.Expiration?.getTime() || Date.now() + 55 * 60 * 1000,
  };

  return result;
}

export function buildAuthorizationUrl(accountId: string, region: SellerRegion): string {
  if (!isAmazonConfigured()) {
    throw new AppError(400, 'Amazon SP-API credentials not configured');
  }

  const state = jwt.sign({ accountId, nonce: Date.now().toString() } satisfies OAuthStatePayload, env.JWT_SECRET, {
    expiresIn: '15m',
  });

  const baseUrl = SELLER_CENTRAL_URLS[region] || SELLER_CENTRAL_URLS.NA;
  const params = new URLSearchParams({
    application_id: amazonConfig.clientId,
    state,
    redirect_uri: getAmazonRedirectUri(),
    version: 'beta',
  });

  return `${baseUrl}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<AuthorizationCodeResponse> {
  if (!isAmazonConfigured()) {
    throw new AppError(400, 'Amazon SP-API credentials not configured');
  }

  const response = await withRetry(() =>
    axios.post<AuthorizationCodeResponse>(
      AMAZON_LWA_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: amazonConfig.clientId,
        client_secret: amazonConfig.clientSecret,
        redirect_uri: getAmazonRedirectUri(),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
  );

  return response.data;
}

export async function handleOAuthCallback(query: {
  spapi_oauth_code?: string;
  state?: string;
  selling_partner_id?: string;
}): Promise<{ accountId: string }> {
  const { spapi_oauth_code, state, selling_partner_id } = query;

  if (!spapi_oauth_code || !state) {
    throw new AppError(400, 'Missing OAuth code or state');
  }

  let payload: OAuthStatePayload;
  try {
    payload = jwt.verify(state, env.JWT_SECRET) as OAuthStatePayload;
  } catch {
    throw new AppError(400, 'Invalid or expired OAuth state');
  }

  const account = await SellerAccount.findByPk(payload.accountId);
  if (!account) {
    throw new AppError(404, 'Account not found');
  }

  const tokens = await exchangeAuthorizationCode(spapi_oauth_code);

  await account.update({
    refresh_token: encrypt(tokens.refresh_token),
    access_token: encrypt(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
    seller_id: selling_partner_id || account.seller_id,
  });

  tokenCache.delete(account.id);

  return { accountId: account.id };
}

export async function disconnectAccount(accountId: string): Promise<void> {
  const account = await SellerAccount.findByPk(accountId);
  if (!account) {
    throw new AppError(404, 'Account not found');
  }

  await account.update({
    refresh_token: null,
    access_token: null,
    token_expires_at: null,
  });

  tokenCache.delete(accountId);
}
