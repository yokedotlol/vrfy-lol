/**
 * Durable Object for per-IP rate limiting + PoW nonce tracking.
 *
 * Free thresholds (no PoW required):
 *   - 10 requests per hour per IP
 *   - 50 requests per day per IP
 *   - Both must pass for a free request
 *   - All non-PoW requests count (no cache exemption — cached
 *     results would be free rides on another user's PoW)
 *
 * Nonce tracking:
 *   - Spent nonces stored as Map<string, number> (nonce → timestamp)
 *   - Pruned after 10 minutes (challenge window + tolerance)
 *   - One solve = one request. Replays rejected.
 *
 * Each IP gets its own DO instance via idFromName(ip).
 */

const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 50;
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;
const NONCE_TTL_MS = 600_000; // 10 minutes

interface WindowState {
  start: number; // unix seconds
  count: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining_hourly: number;
  remaining_daily: number;
  pow_required: boolean;
}

export class RateLimiterDO implements DurableObject {
  private state: DurableObjectState;
  /** Spent nonces: "challenge:nonce" → timestamp (ms) */
  private spentNonces: Map<string, number> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/check':
        return this.check();
      case '/peek':
        return this.peek();
      case '/check-nonce':
        return this.checkNonce(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  /**
 * Increment counters and return rate limit status.
 * Called for all requests without PoW (including cache hits).
 */
  private async check(): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);

    let hourly = await this.state.storage.get<WindowState>('hourly');
    let daily = await this.state.storage.get<WindowState>('daily');

    // Reset expired windows
    if (!hourly || now - hourly.start >= HOUR_SECONDS) {
      hourly = { start: now, count: 0 };
    }
    if (!daily || now - daily.start >= DAY_SECONDS) {
      daily = { start: now, count: 0 };
    }

    const hourlyExceeded = hourly.count >= HOURLY_LIMIT;
    const dailyExceeded = daily.count >= DAILY_LIMIT;

    if (hourlyExceeded || dailyExceeded) {
      return Response.json({
        allowed: false,
        remaining_hourly: Math.max(0, HOURLY_LIMIT - hourly.count),
        remaining_daily: Math.max(0, DAILY_LIMIT - daily.count),
        pow_required: true,
      } satisfies RateLimitResult);
    }

    // Increment both windows
    hourly.count++;
    daily.count++;

    await this.state.storage.put('hourly', hourly);
    await this.state.storage.put('daily', daily);

    // Schedule cleanup alarm
    const nextExpiry = Math.min(
      (hourly.start + HOUR_SECONDS) * 1000,
      (daily.start + DAY_SECONDS) * 1000,
    );
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm || currentAlarm > nextExpiry) {
      await this.state.storage.setAlarm(nextExpiry);
    }

    return Response.json({
      allowed: true,
      remaining_hourly: HOURLY_LIMIT - hourly.count,
      remaining_daily: DAILY_LIMIT - daily.count,
      pow_required: false,
    } satisfies RateLimitResult);
  }

  /** Read current state without incrementing */
  private async peek(): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);

    const hourly = await this.state.storage.get<WindowState>('hourly');
    const daily = await this.state.storage.get<WindowState>('daily');

    const hRemaining = (!hourly || now - hourly.start >= HOUR_SECONDS)
      ? HOURLY_LIMIT
      : Math.max(0, HOURLY_LIMIT - hourly.count);

    const dRemaining = (!daily || now - daily.start >= DAY_SECONDS)
      ? DAILY_LIMIT
      : Math.max(0, DAILY_LIMIT - daily.count);

    return Response.json({
      remaining_hourly: hRemaining,
      remaining_daily: dRemaining,
    });
  }

  /**
   * Check if a nonce has been spent. POST body: { challenge, nonce }
   * Returns 200 if fresh (and records it), 409 if already spent.
   */
  private async checkNonce(request: Request): Promise<Response> {
    const body = await request.json() as { challenge: string; nonce: string };
    const key = `${body.challenge}:${body.nonce}`;

    // Prune expired nonces
    this.pruneNonces();

    if (this.spentNonces.has(key)) {
      return new Response('Nonce already spent', { status: 409 });
    }

    this.spentNonces.set(key, Date.now());
    return new Response('OK', { status: 200 });
  }

  /** Remove nonces older than the TTL */
  private pruneNonces(): void {
    const cutoff = Date.now() - NONCE_TTL_MS;
    for (const [key, ts] of this.spentNonces) {
      if (ts < cutoff) {
        this.spentNonces.delete(key);
      }
    }
  }

  /** Clean up expired rate limit windows */
  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const hourly = await this.state.storage.get<WindowState>('hourly');
    const daily = await this.state.storage.get<WindowState>('daily');

    const hourlyExpired = !hourly || now - hourly.start >= HOUR_SECONDS;
    const dailyExpired = !daily || now - daily.start >= DAY_SECONDS;

    if (hourlyExpired && dailyExpired) {
      // Both expired — clean up everything
      await this.state.storage.deleteAll();
      this.spentNonces.clear();
    } else if (hourlyExpired) {
      await this.state.storage.delete('hourly');
    }
    // Daily cleanup handled by next alarm cycle
  }
}

/**
 * Check free-tier rate limit for an IP address.
 * Called for all requests without PoW (including cache hits — no
 * cache exemption for vrfy, since cached results would let users
 * skip another user's PoW).
 */
export async function checkRateLimit(
  rateLimiter: DurableObjectNamespace,
  ip: string,
): Promise<RateLimitResult> {
  const id = rateLimiter.idFromName(ip);
  const stub = rateLimiter.get(id);

  const response = await stub.fetch(new Request('https://rate-limiter/check'));
  return await response.json() as RateLimitResult;
}

/**
 * Check if a PoW nonce has been spent (and record it if fresh).
 * Returns true if the nonce is fresh, false if already used.
 */
export async function checkNonceFresh(
  rateLimiter: DurableObjectNamespace,
  ip: string,
  challenge: string,
  nonce: string,
): Promise<boolean> {
  const id = rateLimiter.idFromName(ip);
  const stub = rateLimiter.get(id);

  const response = await stub.fetch(
    new Request('https://rate-limiter/check-nonce', {
      method: 'POST',
      body: JSON.stringify({ challenge, nonce }),
    }),
  );

  return response.status === 200;
}
