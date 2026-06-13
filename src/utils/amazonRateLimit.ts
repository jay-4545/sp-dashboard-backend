class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRatePerSec: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerSec);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = ((1 - this.tokens) / this.refillRatePerSec) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }
}

const buckets = new Map<string, TokenBucket>();

export function getAccountRateLimiter(accountId: string): TokenBucket {
  if (!buckets.has(accountId)) {
    buckets.set(accountId, new TokenBucket(5, 0.5));
  }
  return buckets.get(accountId)!;
}

export async function withRateLimit<T>(
  accountId: string,
  fn: () => Promise<T>
): Promise<T> {
  const bucket = getAccountRateLimiter(accountId);
  await bucket.acquire();
  return fn();
}
