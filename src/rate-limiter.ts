// Durable Object for per-IP rate limiting + PoW nonce tracking.
// Privacy: IP addresses are hashed with IP_HASH_SALT before being used
// as Durable Object names — raw IPs are never stored.

const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 50;
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;
const NONCE_TTL_MS = 600_000; // 10 minutes

interface WindowState {
  start: number;
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

  private async check(): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);
    let hourly = await this.state.storage.get<WindowState>('hourly');
    let daily = await this.state.storage.get<WindowState>('daily');
    if (!hourly || now - hourly.start >= HOUR_SECONDS) hourly = { start: now, count: 0 };
    if (!daily || now - daily.start >= DAY_SECONDS) daily = { start: now, count: 0 };
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
    hourly.count++;
    daily.count++;
    await this.state.storage.put('hourly', hourly);
    await this.state.storage.put('daily', daily);
    const nextExpiry = Math.min((hourly.start + HOUR_SECONDS) * 1000, (daily.start + DAY_SECONDS) * 1000);
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm || currentAlarm > nextExpiry) await this.state.storage.setAlarm(nextExpiry);
    return Response.json({
      allowed: true,
      remaining_hourly: HOURLY_LIMIT - hourly.count,
      remaining_daily: DAILY_LIMIT - daily.count,
      pow_required: false,
    } satisfies RateLimitResult);
  }

  private async peek(): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);
    const hourly = await this.state.storage.get<WindowState>('hourly');
    const daily = await this.state.storage.get<WindowState>('daily');
    const hRemaining = (!hourly || now - hourly.start >= HOUR_SECONDS) ? HOURLY_LIMIT : Math.max(0, HOURLY_LIMIT - hourly.count);
    const dRemaining = (!daily || now - daily.start >= DAY_SECONDS) ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - daily.count);
    return Response.json({ remaining_hourly: hRemaining, remaining_daily: dRemaining });
  }

  private async checkNonce(request: Request): Promise<Response> {
    const body = await request.json() as { challenge: string; nonce: string };
    const key = `${body.challenge}:${body.nonce}`;
    this.pruneNonces();
    if (this.spentNonces.has(key)) return new Response('Nonce already spent', { status: 409 });
    this.spentNonces.set(key, Date.now());
    return new Response('OK', { status: 200 });
  }

  private pruneNonces(): void {
    const cutoff = Date.now() - NONCE_TTL_MS;
    for (const [k, ts] of this.spentNonces) if (ts < cutoff) this.spentNonces.delete(k);
  }

  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const hourly = await this.state.storage.get<WindowState>('hourly');
    const daily = await this.state.storage.get<WindowState>('daily');
    const hourlyExpired = !hourly || now - hourly.start >= HOUR_SECONDS;
    const dailyExpired = !daily || now - daily.start >= DAY_SECONDS;
    if (hourlyExpired && dailyExpired) { await this.state.storage.deleteAll(); this.spentNonces.clear(); }
    else if (hourlyExpired) await this.state.storage.delete('hourly');
  }
}

export async function hashRateLimitKey(ip: string, salt?: string): Promise<string> {
  const s = salt || 'vrfy-default-salt';
  const data = new TextEncoder().encode(`${ip}:${s}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function checkRateLimit(rateLimiter: DurableObjectNamespace, key: string): Promise<RateLimitResult> {
  const id = rateLimiter.idFromName(key);
  const stub = rateLimiter.get(id);
  const response = await stub.fetch(new Request('https://rate-limiter/check'));
  return (await response.json()) as RateLimitResult;
}

export async function checkNonceFresh(rateLimiter: DurableObjectNamespace, key: string, challenge: string, nonce: string): Promise<boolean> {
  const id = rateLimiter.idFromName(key);
  const stub = rateLimiter.get(id);
  const response = await stub.fetch(new Request('https://rate-limiter/check-nonce', { method: 'POST', body: JSON.stringify({ challenge, nonce }) }));
  return response.status === 200;
}
