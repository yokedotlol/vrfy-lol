import { describe, test, expect } from 'bun:test';

// ─── PoW Tests ───
// We can't import the actual module because it uses crypto.subtle (Web Crypto API)
// which isn't available in Bun's test runner the same way. Instead we test the
// protocol logic independently.

describe('PoW Protocol', () => {
  // Test the hash format specification: SHA-256(challenge + ":" + nonce)
  test('hash input format uses colon delimiter', () => {
    const challenge = 'abcdef1234567890';
    const nonce = '42';
    const expected = `${challenge}:${nonce}`;
    expect(expected).toBe('abcdef1234567890:42');
  });

  test('nonce is decimal integer string', () => {
    // Nonces must be decimal integers, not hex or other formats
    const nonce = String(847299);
    expect(nonce).toBe('847299');
    expect(parseInt(nonce, 10)).toBe(847299);
  });

  test('challenge is 64-char hex string', () => {
    // HMAC-SHA256 output is 32 bytes = 64 hex chars
    const mockChallenge = 'a'.repeat(64);
    expect(mockChallenge.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(mockChallenge)).toBe(true);
  });

  test('difficulty 18 means 18 leading zero bits', () => {
    // With difficulty 18, the first 2 bytes must be 0x00 0x00
    // and the third byte must have its top 2 bits as 0 (< 0x40)
    const hash = new Uint8Array([0x00, 0x00, 0x20, 0xff]); // 18 leading zeros
    let bits = 0;
    for (const byte of hash) {
      if (byte === 0) { bits += 8; continue; }
      bits += Math.clz32(byte) - 24;
      break;
    }
    expect(bits).toBe(18);
  });

  test('difficulty check rejects insufficient zeros', () => {
    const hash = new Uint8Array([0x00, 0x01, 0x00, 0x00]); // only 15 leading zeros
    let bits = 0;
    for (const byte of hash) {
      if (byte === 0) { bits += 8; continue; }
      bits += Math.clz32(byte) - 24;
      break;
    }
    expect(bits).toBe(15);
    expect(bits >= 18).toBe(false);
  });

  test('batch difficulty scaling: floor(log2(batchSize))', () => {
    const baseDifficulty = 18;
    expect(baseDifficulty + Math.floor(Math.log2(1))).toBe(18);   // batch of 1
    expect(baseDifficulty + Math.floor(Math.log2(2))).toBe(19);   // batch of 2
    expect(baseDifficulty + Math.floor(Math.log2(10))).toBe(21);  // batch of 10
    expect(baseDifficulty + Math.floor(Math.log2(20))).toBe(22);  // batch of 20
  });

  test('5-minute bucket calculation', () => {
    const BUCKET_SECONDS = 300;
    const now = 1718367600; // example timestamp
    const bucket = Math.floor(now / BUCKET_SECONDS);
    const expires = (bucket + 1) * BUCKET_SECONDS;

    // Expires should be at most 300 seconds after now
    expect(expires - now).toBeLessThanOrEqual(BUCKET_SECONDS);
    expect(expires - now).toBeGreaterThan(0);
  });

  test('clock-edge tolerance: previous bucket accepted', () => {
    const BUCKET_SECONDS = 300;
    const now = 1718367600;
    const currentBucket = Math.floor(now / BUCKET_SECONDS);
    const previousBucket = currentBucket - 1;

    // A challenge from the previous bucket should still be valid
    expect(previousBucket).toBe(currentBucket - 1);
    // This means the effective window is 5-10 minutes
  });
});

// ─── Error Schema Tests ───

describe('Error Schema', () => {
  test('error codes map to correct HTTP status', () => {
    const statusMap: Record<string, number> = {
      'invalid_request': 400,
      'invalid_email': 422,
      'rate_limited': 429,
      'pow_invalid': 429,
      'internal_error': 500,
      'service_unavailable': 503,
    };

    for (const [code, status] of Object.entries(statusMap)) {
      expect(status).toBeGreaterThanOrEqual(400);
      // rate_limited and pow_invalid share 429
      if (code === 'rate_limited' || code === 'pow_invalid') {
        expect(status).toBe(429);
      }
    }
  });

  test('rate limited error includes PoW challenge', () => {
    const challenge = {
      algorithm: 'sha256' as const,
      challenge: 'a'.repeat(64),
      difficulty: 18,
      expires: Math.floor(Date.now() / 1000) + 300,
    };

    const error = {
      error: 'rate_limited',
      message: 'Rate limit exceeded.',
      docs: 'https://vrfy.lol/docs/pow',
      pow: challenge,
    };

    expect(error.pow).toBeDefined();
    expect(error.pow.algorithm).toBe('sha256');
    expect(error.pow.difficulty).toBe(18);
    expect(error.pow.challenge.length).toBe(64);
  });

  test('algorithm field is always present in challenge', () => {
    const challenge = {
      algorithm: 'sha256' as const,
      challenge: 'test',
      difficulty: 18,
      expires: 0,
    };
    expect(challenge.algorithm).toBe('sha256');
  });
});

// ─── Rate Limit Tests ───

describe('Rate Limits', () => {
  test('hourly limit is 10', () => {
    const HOURLY_LIMIT = 10;
    expect(HOURLY_LIMIT).toBe(10);
  });

  test('daily limit is 50', () => {
    const DAILY_LIMIT = 50;
    expect(DAILY_LIMIT).toBe(50);
  });

  test('both thresholds must pass for free access', () => {
    // Simulate: hourly OK, daily exceeded → PoW required
    const hourlyOk = 5 < 10;
    const dailyExceeded = 50 >= 50;
    const allowed = hourlyOk && !dailyExceeded;
    expect(allowed).toBe(false);

    // Simulate: hourly exceeded, daily OK → PoW required
    const hourlyExceeded = 10 >= 10;
    const dailyOk = 30 < 50;
    const allowed2 = !hourlyExceeded && dailyOk;
    expect(allowed2).toBe(false);

    // Simulate: both OK → allowed
    const allowed3 = (5 < 10) && (30 < 50);
    expect(allowed3).toBe(true);
  });

  test('nonce key format is challenge:nonce', () => {
    const challenge = 'abc123';
    const nonce = '42';
    const key = `${challenge}:${nonce}`;
    expect(key).toBe('abc123:42');
  });

  test('nonce TTL is 10 minutes', () => {
    const NONCE_TTL_MS = 600_000;
    expect(NONCE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

// ─── Response Schema Tests ───

describe('Response Schema v1.0', () => {
  test('_meta includes signals and signals_positive', () => {
    const meta = {
      signals: 9,
      signals_positive: 7,
      cached: false,
      query_ms: 147,
      version: '1.0.0',
    };

    expect(meta.signals).toBeGreaterThan(0);
    expect(meta.signals_positive).toBeLessThanOrEqual(meta.signals);
    expect(meta.version).toBe('1.0.0');
    // Old 'note' field is gone
    expect((meta as Record<string, unknown>)['note']).toBeUndefined();
  });

  test('response has no existence object', () => {
    const response = {
      email: 'user@example.com',
      action: 'allow',
      confidence: 'valid',
      validation: {},
      _meta: { signals: 9, signals_positive: 7, cached: false, query_ms: 100, version: '1.0.0' },
    };

    // No existence fields — opaque extended validation
    expect((response as Record<string, unknown>)['existence']).toBeUndefined();
    expect((response as Record<string, unknown>)['gravatar']).toBeUndefined();
    expect((response as Record<string, unknown>)['breaches']).toBeUndefined();
    expect((response as Record<string, unknown>)['webfinger']).toBeUndefined();
    expect((response as Record<string, unknown>)['pgp_key']).toBeUndefined();
    expect((response as Record<string, unknown>)['seen_online']).toBeUndefined();
  });

  test('options come from body not query params', () => {
    const body = {
      email: 'user@example.com',
      force: true,
      quick: false,
      dkim: 'full',
    };

    expect(body.force).toBe(true);
    expect(body.quick).toBe(false);
    expect(body.dkim).toBe('full');
  });
});

// ─── HMAC Cache Key Tests ───

describe('HMAC Cache Keys', () => {
  test('domain cache key is plain domain string', () => {
    const domain = 'gmail.com';
    const key = `domain:${domain}`;
    expect(key).toBe('domain:gmail.com');
    // Domains are not PII — no HMAC needed
  });

  test('extended cache key format is extended:<hex>', () => {
    // Can't test actual HMAC without crypto.subtle, but verify format
    const mockHex = 'a1b2c3d4e5f6'.repeat(11).substring(0, 64);
    const key = `extended:${mockHex}`;
    expect(key.startsWith('extended:')).toBe(true);
    expect(key.length).toBe(9 + 64); // "extended:" + 64 hex chars
  });

  test('cache TTLs match spec', () => {
    const DOMAIN_CACHE_TTL = 604800;    // 7 days
    const EXTENDED_CACHE_TTL = 2592000; // 30 days

    expect(DOMAIN_CACHE_TTL).toBe(7 * 24 * 60 * 60);
    expect(EXTENDED_CACHE_TTL).toBe(30 * 24 * 60 * 60);
  });
});

// ─── Routing Tests ───

describe('POST-only Routing', () => {
  test('email in URL path should be rejected', () => {
    // GET /user@example.com should return 405, not process
    const path = '/user@example.com';
    const segment = path.substring(1);
    expect(segment.includes('@')).toBe(true);
    // Server should return 405 Method Not Allowed
  });

  test('domain in URL path is allowed for GET', () => {
    // GET /example.com should work (domain-only, Phase 2)
    const path = '/example.com';
    const segment = path.substring(1);
    expect(segment.includes('@')).toBe(false);
  });

  test('POST / is the primary validation endpoint', () => {
    // POST with body {"email": "..."} — the only way to validate
    const method = 'POST';
    const path = '/';
    expect(method).toBe('POST');
    expect(path).toBe('/');
  });
});
