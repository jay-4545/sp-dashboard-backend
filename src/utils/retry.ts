import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  retryOn?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 4, baseDelayMs = 2000, retryOn } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const shouldRetry = retryOn
        ? retryOn(error)
        : isRetryableError(error);

      if (!shouldRetry || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status === 429 || (response?.status !== undefined && response.status >= 500);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
