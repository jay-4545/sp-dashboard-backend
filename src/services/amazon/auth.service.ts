import axios from 'axios';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { amazonConfig, AMAZON_LWA_URL } from '../../config/amazon';
import { isAmazonConfigured } from '../../config';
import { SellerAccount } from '../../models';
import { decrypt, encrypt } from '../../utils/encrypt';
import { logger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';

interface LwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

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

export async function signSpApiRequest(): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  const stsClient = new STSClient({ region: amazonConfig.region });
  const command = new AssumeRoleCommand({
    RoleArn: process.env.AWS_ROLE_ARN || '',
    RoleSessionName: 'sp-api-session',
    DurationSeconds: 3600,
  });

  if (!process.env.AWS_ROLE_ARN) {
    return { accessKeyId: '', secretAccessKey: '', sessionToken: '' };
  }

  const response = await stsClient.send(command);
  const credentials = response.Credentials;

  return {
    accessKeyId: credentials?.AccessKeyId || '',
    secretAccessKey: credentials?.SecretAccessKey || '',
    sessionToken: credentials?.SessionToken || '',
  };
}
