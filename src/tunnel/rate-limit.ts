type Bucket = { tokens: number; updatedAt: number };

export class TokenBucketLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.refillPerMs = refillPerMinute / 60_000; // tokens per ms
  }

  take(key: string, cost = 1): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    // refill
    const elapsed = now - b.updatedAt;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    b.updatedAt = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      this.buckets.set(key, b);
      return true;
    }
    this.buckets.set(key, b);
    return false;
  }
}

