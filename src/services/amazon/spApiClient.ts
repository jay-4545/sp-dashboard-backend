import aws4 from 'aws4';
import axios, { isAxiosError } from 'axios';
import { amazonConfig, getSigningRegion } from '../../config/amazon';
import { isAwsSigningConfigured } from '../../config';
import { SellerAccount } from '../../models';
import { getAccessTokenForAccount, getAwsCredentials } from './auth.service';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface SpApiRequestOptions {
  params?: Record<string, string>;
  data?: unknown;
}

interface SpApiErrorBody {
  errors?: Array<{ code?: string; message?: string; details?: string }>;
}

function formatSpApiError(error: unknown): string {
  if (!isAxiosError(error)) {
    return (error as Error).message;
  }

  const status = error.response?.status;
  const data = error.response?.data as SpApiErrorBody | string | undefined;

  if (data && typeof data === 'object' && Array.isArray(data.errors) && data.errors.length > 0) {
    const details = data.errors
      .map((entry) => [entry.code, entry.message, entry.details].filter(Boolean).join(': '))
      .join(' | ');
    return `SP-API ${status}: ${details}`;
  }

  if (typeof data === 'string' && data.trim()) {
    return `SP-API ${status}: ${data}`;
  }

  if (data && typeof data === 'object') {
    return `SP-API ${status}: ${JSON.stringify(data)}`;
  }

  return error.message;
}

export async function spApiRequest<T>(
  account: SellerAccount,
  method: HttpMethod,
  path: string,
  options?: SpApiRequestOptions
): Promise<T> {
  const accessToken = await getAccessTokenForAccount(account.id);
  const baseUrl = amazonConfig.getEndpoint(account.region);
  const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);

  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const body = options?.data !== undefined ? JSON.stringify(options.data) : undefined;
  const host = url.host;
  const pathWithQuery = url.pathname + url.search;

  const headers: Record<string, string> = {
    'x-amz-access-token': accessToken,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const signedRequest: aws4.Request = {
    host,
    path: pathWithQuery,
    method,
    headers: { ...headers },
    body,
    service: 'execute-api',
    region: getSigningRegion(account.region),
  };

  if (isAwsSigningConfigured()) {
    const credentials = await getAwsCredentials();
    aws4.sign(signedRequest, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    });
  }

  try {
    const response = await axios({
      method,
      url: url.toString(),
      headers: signedRequest.headers as Record<string, string>,
      data: body,
    });

    return response.data as T;
  } catch (error) {
    throw new Error(formatSpApiError(error));
  }
}
