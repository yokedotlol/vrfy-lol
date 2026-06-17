// ─── Main validation orchestrator (v1.0) ───
// Wires all validators together. POST-only for email validation.
// Options (force, quick, dkim) come from request body, not query params.

import type {
  VrfyResponse, ValidationResult, MxResult,
  ProviderInfo, Env, DomainCacheEntry,
} from './types';
import { validateSyntax } from './validators/syntax';
import { checkMx } from './validators/mx';
import { checkPrivacyRelay } from './validators/privacy-relay';
import { detectTypo } from './validators/typo';
import { isRoleAccount } from './validators/role-account';
import { detectProvider } from './validators/provider';
import { detectSubaddress } from './validators/subaddress';
import { isDisposableDomain } from './data/disposable';
import { isFreeProvider } from './data/free-providers';
import { determineAction } from './validators/action';
import { classifyConfidence } from './validators/confidence';

const VERSION = '1.0.0';
const DOMAIN_CACHE_TTL = 604800;   // 7 days in seconds
const EXTENDED_CACHE_TTL = 2592000; // 30 days in seconds

export interface ValidateOptions {
  /** Skip enrichment/security (Tier 1 only) */
  quick?: boolean;
  /** Bypass KV cache */
  force?: boolean;
  /** Full DKIM probing */
  dkim?: 'full';
}

/**
 * Validate a single email address.
 * Orchestrates all Tier 1 validators and assembles the response.
 */
export async function validateEmail(
  email: string,
  env: Env,
  options: ValidateOptions = {},
): Promise<VrfyResponse> {
  const startMs = Date.now();

  // Step 1: Syntax validation (synchronous, instant)
  const syntax = validateSyntax(email);

  if (!syntax.valid || !syntax.domain || !syntax.local_part) {
    // Invalid syntax — return immediately, no DNS needed
    return buildResponse(email, syntax, null, null, false, false, false, null, false, null, null, null, startMs, false, null);
  }

  const domain = syntax.domain;
  const localPart = syntax.local_part;

  // Step 2: Check domain-level cache (key is plain domain — not PII)
  let cached = false;
  let domainCache: DomainCacheEntry | null = null;

  if (!options.force) {
    domainCache = await getDomainCache(env, domain);
    if (domainCache) {
      cached = true;
    }
  }

  // Step 3: Domain-level checks (cached or fresh)
  let mx: MxResult;
  let provider: ProviderInfo | null;
  let disposable: boolean;
  let freeProvider: boolean;
  let privacyRelay: boolean;
  let privacyRelayService: string | null;

  if (domainCache) {
    mx = domainCache.mx;
    provider = domainCache.provider;
    disposable = domainCache.is_disposable;
    freeProvider = domainCache.is_free_provider;
    privacyRelay = domainCache.is_privacy_relay;
    privacyRelayService = domainCache.privacy_relay_service;
  } else {
    // Run domain checks — MX is async, rest are sync
    const privacyResult = checkPrivacyRelay(domain);
    disposable = isDisposableDomain(domain);
    freeProvider = isFreeProvider(domain);
    privacyRelay = privacyResult.is_privacy_relay;
    privacyRelayService = privacyResult.service;

    // Privacy relay check overrides disposable
    if (privacyRelay) {
      disposable = false;
    }

    // MX lookup (async)
    mx = await checkMx(domain);

    // Provider detection from MX
    provider = mx.has_mx ? detectProvider(mx.mx_records.map(r => r.host)) : null;

    // Cache domain-level results (7-day TTL)
    await putDomainCache(env, domain, {
      mx,
      provider,
      is_disposable: disposable,
      is_free_provider: freeProvider,
      is_privacy_relay: privacyRelay,
      privacy_relay_service: privacyRelayService,
      cached_at: Date.now(),
    });
  }

  // Step 4: Local-part checks (synchronous, no caching needed)
  const roleAccount = isRoleAccount(localPart);
  const typo = detectTypo(domain);
  const subaddress = detectSubaddress(localPart, domain);

  // Assemble typo suggestion with full email
  const typoSuggestion = typo.has_typo && typo.suggested_domain
    ? `${localPart}@${typo.suggested_domain}`
    : null;

  // Step 5: Extended validation (if plugin is bound)
  let extendedScore: number | null = null;
  if (env.EXTENDED_VALIDATION && !options.quick) {
    extendedScore = await callExtendedValidation(env, email, domain);
  }

  return buildResponse(
    email, syntax, mx, provider, disposable, freeProvider,
    privacyRelay, privacyRelayService, roleAccount,
    typo, typoSuggestion, subaddress, startMs, cached,
    extendedScore,
  );
}

/**
 * Validate a batch of emails.
 * Shares domain cache across the batch for efficiency.
 */
export async function validateBatch(
  emails: string[],
  env: Env,
  options: ValidateOptions = {},
): Promise<{ results: VrfyResponse[]; batch_ms: number; domains_queried: number }> {
  const startMs = Date.now();
  const domains = new Set<string>();

  const results = await Promise.all(
    emails.map(async (email) => {
      const result = await validateEmail(email, env, options);
      const syntax = validateSyntax(email);
      if (syntax.domain) domains.add(syntax.domain);
      return result;
    }),
  );

  return {
    results,
    batch_ms: Date.now() - startMs,
    domains_queried: domains.size,
  };
}

// ─── Extended validation ───

/**
 * Call the optional extended validation service binding.
 * Returns an opaque score (0.0-1.0) or null on failure.
 */
async function callExtendedValidation(
  env: Env,
  email: string,
  domain: string,
): Promise<number | null> {
  if (!env.EXTENDED_VALIDATION) return null;

  try {
    // Check extended cache first (HMAC-keyed, 30-day TTL)
    const cacheKey = await hmacCacheKey(env.CACHE_SECRET, email);
    const cachedScore = await env.CACHE.get(cacheKey);
    if (cachedScore !== null) {
      return parseFloat(cachedScore);
    }

    // Call the plugin
    const response = await env.EXTENDED_VALIDATION.fetch(
      new Request('https://extended-validation/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, domain }),
      }),
    );

    if (!response.ok) return null;

    const data = await response.json() as { score: number };
    const score = data.score;

    // Cache the result (30-day TTL)
    await env.CACHE.put(cacheKey, String(score), {
      expirationTtl: EXTENDED_CACHE_TTL,
    });

    return score;
  } catch {
    // Extended validation failure is non-fatal
    return null;
  }
}

/**
 * Compute HMAC-SHA-256 cache key for email-level data.
 * Uses CACHE_SECRET (Workers secret) so keys can't be reversed.
 */
async function hmacCacheKey(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(email.toLowerCase()),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `extended:${hex}`;
}

// ─── Cache helpers ───

async function getDomainCache(env: Env, domain: string): Promise<DomainCacheEntry | null> {
  try {
    const key = `domain:${domain}`;
    const raw = await env.CACHE.get(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as DomainCacheEntry;

    // Check expiry (belt-and-suspenders with KV's native TTL)
    if (Date.now() - entry.cached_at > DOMAIN_CACHE_TTL * 1000) {
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

async function putDomainCache(env: Env, domain: string, entry: DomainCacheEntry): Promise<void> {
  try {
    const key = `domain:${domain}`;
    await env.CACHE.put(key, JSON.stringify(entry), {
      expirationTtl: DOMAIN_CACHE_TTL,
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Signals counting ───

interface SignalsCount {
  total: number;
  positive: number;
}

function countSignals(
  syntax: ReturnType<typeof validateSyntax>,
  mx: MxResult | null,
  disposable: boolean,
  freeProvider: boolean,
  privacyRelay: boolean,
  roleAccount: boolean,
  typoHasTypo: boolean,
  provider: ProviderInfo | null,
  subaddressIsSubaddressed: boolean,
  extendedScore: number | null,
): SignalsCount {
  let total = 0;
  let positive = 0;

  // Tier 1 signals (always checked)
  total++; if (syntax.valid) positive++;                // syntax
  total++; if (mx?.has_mx) positive++;                  // mx
  total++; if (!disposable) positive++;                 // not disposable
  total++; if (!privacyRelay) positive++;               // not privacy relay
  total++; if (!roleAccount) positive++;                // not role account
  total++; if (!freeProvider) positive++;               // not free provider
  total++; if (!typoHasTypo) positive++;                // no typo
  total++; if (provider !== null) positive++;           // provider identified
  // subaddress is neutral, just a flag
  total++;
  if (!subaddressIsSubaddressed) positive++;

  // Extended validation (opaque score → binary signal)
  if (extendedScore !== null) {
    // The extended plugin checked N signals internally — we report
    // a fixed count since the plugin is opaque
    total += 5; // approximate: gravatar, hibp, webfinger, pgp, composite
    if (extendedScore > 0.0) positive++;
    if (extendedScore > 0.25) positive++;
    if (extendedScore > 0.5) positive++;
    if (extendedScore > 0.75) positive++;
    if (extendedScore >= 1.0) positive++;
  }

  return { total, positive };
}

// ─── Response builder ───

function buildResponse(
  email: string,
  syntax: ReturnType<typeof validateSyntax>,
  mx: MxResult | null,
  provider: ProviderInfo | null,
  disposable: boolean,
  freeProvider: boolean,
  privacyRelay: boolean,
  privacyRelayService: string | null,
  roleAccount: boolean,
  typo: ReturnType<typeof detectTypo> | null,
  typoSuggestion: string | null,
  subaddress: ReturnType<typeof detectSubaddress> | null,
  startMs: number,
  cached: boolean,
  extendedScore: number | null,
): VrfyResponse {
  const effectiveMx: MxResult = mx ?? {
    has_mx: false,
    mx_records: [],
    null_mx: false,
    domain_exists: false,
    has_a_fallback: false,
    error: null,
  };

  const catchAllLikely = provider?.catch_all_default ?? false;

  let action = determineAction({
    syntax_valid: syntax.valid,
    mx: effectiveMx,
    is_disposable: disposable,
    is_privacy_relay: privacyRelay,
    is_role_account: roleAccount,
    is_free_provider: freeProvider,
    has_typo: typo?.has_typo ?? false,
    catch_all_likely: catchAllLikely,
  });

  let confidence = classifyConfidence({
    syntax_valid: syntax.valid,
    mx: effectiveMx,
    is_disposable: disposable,
    is_privacy_relay: privacyRelay,
    is_role_account: roleAccount,
    is_free_provider: freeProvider,
    provider,
    has_typo: typo?.has_typo ?? false,
  });

  // Extended validation can boost confidence and promote action
  if (extendedScore !== null && extendedScore > 0.5) {
    if (confidence === 'likely_valid') {
      confidence = 'valid';
    }
    if (action === 'verify' && catchAllLikely) {
      // Extended validation confirmed existence on a catch-all provider
      action = 'allow';
    }
  }

  const signals = countSignals(
    syntax, mx, disposable, freeProvider, privacyRelay,
    roleAccount, typo?.has_typo ?? false, provider,
    subaddress?.is_subaddressed ?? false, extendedScore,
  );

  const validation: ValidationResult = {
    syntax_valid: syntax.valid,
    mx_found: effectiveMx.has_mx,
    null_mx: effectiveMx.null_mx,
    disposable,
    privacy_relay: privacyRelay,
    privacy_relay_service: privacyRelayService,
    free_provider: freeProvider,
    role_account: roleAccount,
    has_typo: typo?.has_typo ?? false,
    typo_suggestion: typoSuggestion,
    provider,
    subaddressed: subaddress?.is_subaddressed ?? false,
    subaddress_tag: subaddress?.tag ?? null,
    subaddress_base: subaddress?.base_address ?? null,
  };

  return {
    email: syntax.normalized ?? email,
    action,
    confidence,
    validation,
    // enrichment and security omitted until Phase 2/3
    _meta: {
      signals: signals.total,
      signals_positive: signals.positive,
      cached,
      query_ms: Date.now() - startMs,
      version: VERSION,
    },
  };
}
