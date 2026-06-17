/**
 * @yokedotlol/vrfy — Email validation client for vrfy.lol
 *
 * Transparently handles proof-of-work challenges when rate-limited.
 *
 * @example
 * ```ts
 * import { validate, validateBatch } from '@yokedotlol/vrfy';
 *
 * const result = await validate('user@example.com');
 * console.log(result.action); // 'allow' | 'verify' | 'block'
 * ```
 */

import { createHash } from 'node:crypto';

// ─── Public API ───

const DEFAULT_BASE_URL = 'https://vrfy.lol';

export interface ClientOptions {
  baseURL?: string;
  timeout?: number;
}

export interface ValidateOptions {
  quick?: boolean;
  force?: boolean;
  dkim?: 'full';
}

/**
 * Validate a single email address.
 * Automatically solves proof-of-work if rate-limited.
 */
export async function validate(
  email: string,
  opts?: ValidateOptions & ClientOptions,
): Promise<VrfyResult> {
  const baseURL = opts?.baseURL ?? DEFAULT_BASE_URL;
  const body: Record<string, unknown> = { email };
  if (opts?.quick) body.quick = true;
  if (opts?.force) body.force = true;
  if (opts?.dkim) body.dkim = opts.dkim;

  const data = await postWithPow(`${baseURL}/`, body, opts?.timeout);
  return data as VrfyResult;
}

/**
 * Validate up to 20 email addresses in one request.
 * Automatically solves proof-of-work if rate-limited.
 */
export async function validateBatch(
  emails: string[],
  opts?: ValidateOptions & ClientOptions,
): Promise<BatchResult> {
  if (emails.length === 0) throw new Error('vrfy: empty email list');
  if (emails.length > 20) throw new Error(`vrfy: batch size ${emails.length} exceeds maximum of 20`);

  const baseURL = opts?.baseURL ?? DEFAULT_BASE_URL;
  const body: Record<string, unknown> = { emails };
  if (opts?.quick) body.quick = true;
  if (opts?.force) body.force = true;

  const data = await postWithPow(`${baseURL}/batch`, body, opts?.timeout);
  return data as BatchResult;
}

// ─── HTTP + PoW ───

interface PowChallenge {
  algorithm: string;
  challenge: string;
  difficulty: number;
  expires: number;
}

interface ErrorBody {
  error: string;
  message: string;
  pow?: PowChallenge;
}

async function postWithPow(
  url: string,
  body: Record<string, unknown>,
  timeout?: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout ?? 30_000);

  try {
    // First attempt
    let resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'vrfy-node/1.0' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (resp.ok) return resp.json();

    if (resp.status !== 429) {
      const text = await resp.text();
      let msg = `vrfy: API error ${resp.status}`;
      try {
        const err: ErrorBody = JSON.parse(text);
        if (err.message) msg = `vrfy: ${err.message}`;
      } catch { /* use default */ }
      throw new Error(msg);
    }

    // 429 — solve PoW
    const errBody: ErrorBody = await resp.json() as ErrorBody;
    if (!errBody.pow) throw new Error('vrfy: rate limited with no PoW challenge');

    const nonce = solvePoW(errBody.pow.challenge, errBody.pow.difficulty);
    body.pow = { challenge: errBody.pow.challenge, nonce: String(nonce) };

    // Retry with solution
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'vrfy-node/1.0' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`vrfy: request failed after PoW (status ${resp.status})`);
    }
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── PoW Solver ───

/**
 * Find nonce where SHA-256(challenge + ":" + nonce) has >= difficulty leading zero bits.
 */
export function solvePoW(challenge: string, difficulty: number): number {
  const prefix = Buffer.from(`${challenge}:`);

  for (let nonce = 0; nonce < Number.MAX_SAFE_INTEGER; nonce++) {
    const nonceBytes = Buffer.from(String(nonce));
    const input = Buffer.concat([prefix, nonceBytes]);
    const hash = createHash('sha256').update(input).digest();

    if (countLeadingZeroBits(hash) >= difficulty) {
      return nonce;
    }
  }
  throw new Error('vrfy: exhausted nonce space');
}

export function countLeadingZeroBits(hash: Buffer): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

// ─── Response types ───

export interface VrfyResult {
  email: string;
  action: 'allow' | 'verify' | 'block';
  confidence: 'valid' | 'likely_valid' | 'risky' | 'invalid' | 'unknown';
  validation: ValidationResult;
  enrichment?: EnrichmentResult;
  security?: SecurityResult;
  _meta: MetaResult;
}

export interface BatchResult {
  results: VrfyResult[];
  batch_ms: number;
  domains_queried: number;
}

export interface ValidationResult {
  syntax_valid: boolean;
  mx_found: boolean;
  null_mx: boolean;
  disposable: boolean;
  privacy_relay: boolean;
  privacy_relay_service: string | null;
  free_provider: boolean;
  role_account: boolean;
  has_typo: boolean;
  typo_suggestion: string | null;
  provider: ProviderInfo | null;
  subaddressed: boolean;
  subaddress_tag: string | null;
  subaddress_base: string | null;
}

export interface ProviderInfo {
  name: string;
  is_free: boolean;
  catch_all_default: boolean;
  smtp_verification: 'reliable' | 'unreliable' | 'blocked' | 'unknown';
  note: string;
}

export interface EnrichmentResult {
  domain_age_days: number | null;
  registered_date: string | null;
  dnsbl_listed: boolean;
  dnsbl_lists_checked: number;
  catch_all_likely: boolean;
}

export interface SecurityResult {
  grade: string;
  spf: boolean;
  dkim: boolean;
  dkim_selectors: string[];
  dmarc: { found: boolean; policy: string | null };
  mta_sts: boolean;
  tls_rpt: boolean;
  bimi: boolean;
}

export interface MetaResult {
  signals: number;
  signals_positive: number;
  cached: boolean;
  query_ms: number;
  version: string;
}
