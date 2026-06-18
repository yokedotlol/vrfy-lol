// ─── Main validation orchestrator (v1.0) ───
// Wires all validators together. POST-only for email validation.
// Options (force, quick, dkim) come from request body, not query params.

import type {
  VrfyResponse, ValidationResult, MxResult,
  ProviderInfo, Env, DomainCacheEntry,
  SecurityResult, HeuristicResult,
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
import {
  checkDmarc, checkSpf, checkBimi, checkMtaSts,
  buildSecurityResult,
} from './validators/dns-security';
import {
  checkRiskyTld, checkDomainEntropy, checkSpamTrap,
} from './validators/domain-heuristics';
import {
  fingerprintMx, isSelfHostedMx,
} from './validators/mx-fingerprint';

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
  /** Admin key for signal visibility */
  adminKey?: string;
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
    return buildResponse(email, syntax, null, null, false, false, false, null, false, null, null, null, startMs, false, null, null, null, undefined);
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
  let security: SecurityResult | null = null;
  let heuristics: HeuristicResult | null = null;

  if (domainCache) {
    mx = domainCache.mx;
    provider = domainCache.provider;
    disposable = domainCache.is_disposable;
    freeProvider = domainCache.is_free_provider;
    privacyRelay = domainCache.is_privacy_relay;
    privacyRelayService = domainCache.privacy_relay_service;
    security = domainCache.security;
    heuristics = domainCache.heuristics;
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

    // MX lookup (async) + DNS security checks (async, parallel)
    const [mxResult, dmarcResult, spfResult, bimiResult, mtaStsResult] = options.quick
      ? [await checkMx(domain), null, null, null, null]
      : await Promise.all([
          checkMx(domain),
          checkDmarc(domain),
          checkSpf(domain),
          checkBimi(domain),
          checkMtaSts(domain),
        ]);

    mx = mxResult;

    // Provider detection from MX
    provider = mx.has_mx ? detectProvider(mx.mx_records.map(r => r.host)) : null;

    // Reconcile provider.is_free with the free-providers list.
    // MX-based detection can't distinguish Gmail from Google Workspace
    // (same MX hosts), so the domain-level free-provider check wins.
    if (provider && freeProvider && !provider.is_free) {
      provider = { ...provider, is_free: true };
    }

    // Build security result if we ran the checks
    if (dmarcResult && spfResult && bimiResult && mtaStsResult) {
      security = buildSecurityResult(dmarcResult, spfResult, bimiResult, mtaStsResult);
    }

    // Domain heuristics (sync, instant)
    const riskyTld = checkRiskyTld(domain);
    const entropy = checkDomainEntropy(domain);
    const mxFp = fingerprintMx(mx.mx_records);
    const selfHosted = isSelfHostedMx(mx.mx_records, domain);

    heuristics = {
      risky_tld: riskyTld.is_risky_tld,
      tld: riskyTld.tld,
      domain_entropy: entropy.entropy,
      entropy_suspicious: entropy.is_suspicious,
      spam_trap: false,  // per-email, handled below
      spam_trap_pattern: null,
      mx_provider_class: selfHosted ? 'self-hosted' : mxFp.mx_provider_class,
      mx_security_gateway: mxFp.mx_security_gateway,
    };

    // Cache domain-level results (7-day TTL)
    await putDomainCache(env, domain, {
      mx,
      provider,
      is_disposable: disposable,
      is_free_provider: freeProvider,
      is_privacy_relay: privacyRelay,
      privacy_relay_service: privacyRelayService,
      security,
      heuristics,
      cached_at: Date.now(),
    });
  }

  // Step 4: Local-part checks (synchronous, no caching needed)
  const roleAccount = isRoleAccount(localPart);
  const typo = detectTypo(domain);
  const subaddress = detectSubaddress(localPart, domain);
  const spamTrap = checkSpamTrap(localPart);

  // Merge per-email spam trap into heuristics (domain part is cached, local part isn't)
  const emailHeuristics: HeuristicResult | null = heuristics
    ? {
        ...heuristics,
        spam_trap: spamTrap.is_spam_trap,
        spam_trap_pattern: spamTrap.pattern,
      }
    : null;

  // Assemble typo suggestion with full email
  const typoSuggestion = typo.has_typo && typo.suggested_domain
    ? `${localPart}@${typo.suggested_domain}`
    : null;

  // Step 5: Extended validation (if plugin is bound)
  let extendedResult: ExtendedResult | null = null;
  if (env.EXTENDED_VALIDATION && !options.quick) {
    extendedResult = await callExtendedValidation(env, email, domain);
  }

  const extendedScore = extendedResult?.score ?? null;
  const isAdmin = !!(options.adminKey && env.ADMIN_KEY && options.adminKey === env.ADMIN_KEY);

  return buildResponse(
    email, syntax, mx, provider, disposable, freeProvider,
    privacyRelay, privacyRelayService, roleAccount,
    typo, typoSuggestion, subaddress, startMs, cached,
    extendedScore, security, emailHeuristics,
    isAdmin ? extendedResult?.signals : undefined,
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

/** Result from the extended validation plugin */
interface ExtendedResult {
  score: number;
  signals?: Record<string, boolean>;
}

/**
 * Call the optional extended validation service binding.
 * Returns score and per-signal breakdown, or null on failure.
 */
async function callExtendedValidation(
  env: Env,
  email: string,
  domain: string,
): Promise<ExtendedResult | null> {
  if (!env.EXTENDED_VALIDATION) return null;

  try {
    // Check extended cache first (HMAC-keyed, 30-day TTL)
    const cacheKey = await hmacCacheKey(env.CACHE_SECRET, email);
    const cachedValue = await env.CACHE.get(cacheKey);
    if (cachedValue !== null) {
      try {
        return JSON.parse(cachedValue) as ExtendedResult;
      } catch {
        // Legacy cache entry (plain score string) — parse as number
        const score = parseFloat(cachedValue);
        return isNaN(score) ? null : { score };
      }
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

    const data = await response.json() as { score: number; signals?: Record<string, boolean> };
    const result: ExtendedResult = {
      score: data.score,
      signals: data.signals,
    };

    // Cache the full result (30-day TTL)
    await env.CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: EXTENDED_CACHE_TTL,
    });

    return result;
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
  security: SecurityResult | null,
  heuristics: HeuristicResult | null,
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

  // Security signals (Phase 1)
  if (security) {
    total++; if (security.spf) positive++;              // SPF present
    total++; if (security.dmarc.found) positive++;      // DMARC present
    total++; if (security.bimi) positive++;             // BIMI present
    total++; if (security.mta_sts) positive++;          // MTA-STS present
    // Security grade as a signal: A or better = positive
    total++;
    if (security.grade === 'A' || security.grade === 'A+') positive++;
  }

  // Heuristic signals (Phase 1)
  if (heuristics) {
    total++; if (!heuristics.risky_tld) positive++;     // not risky TLD
    total++; if (!heuristics.entropy_suspicious) positive++; // not random domain
    total++; if (!heuristics.spam_trap) positive++;     // not spam trap
    total++;                                            // mx class known
    if (heuristics.mx_provider_class !== 'unknown') positive++;
  }

  // Extended validation (opaque score → binary signal)
  if (extendedScore !== null) {
    // The extended plugin checked N signals internally — we report
    // a fixed count since the plugin is opaque
    total += 8; // extended plugin: gravatar, github, xon, webfinger, pgp, keybase, libravatar, gitlab
    // Map opaque score to positive signal count proportionally
    // Max soft-OR score with 8 signals ≈ 0.889, so scale accordingly
    const maxScore = 0.889;
    const extPositive = Math.round((extendedScore / maxScore) * 8);
    positive += Math.min(extPositive, 8);
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
  security: SecurityResult | null,
  heuristics: HeuristicResult | null,
  adminSignals?: Record<string, boolean>,
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

  // Phase 1 heuristic adjustments
  if (heuristics) {
    // Spam trap → block
    if (heuristics.spam_trap && action !== 'block') {
      action = 'block';
    }
    // Risky TLD → bump toward verify
    if (heuristics.risky_tld && action === 'allow') {
      action = 'verify';
    }
    // High entropy domain → bump toward verify
    if (heuristics.entropy_suspicious && action === 'allow') {
      action = 'verify';
    }
    // Risky TLD or suspicious entropy → reduce confidence
    if ((heuristics.risky_tld || heuristics.entropy_suspicious) && confidence === 'valid') {
      confidence = 'likely_valid';
    }
  }

  // Security posture adjustments
  if (security) {
    // Strong security grade → boost confidence
    if ((security.grade === 'A' || security.grade === 'A+') && confidence === 'likely_valid') {
      confidence = 'valid';
    }
    // No SPF + no DMARC → reduce confidence slightly
    if (!security.spf && !security.dmarc.found && confidence === 'valid') {
      confidence = 'likely_valid';
    }
  }

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
    security, heuristics,
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
    // enrichment and security in response
    ...(security ? { security } : {}),
    ...(heuristics ? { heuristics } : {}),
    ...(adminSignals ? { _admin: { existence_signals: adminSignals } } : {}),
    _meta: {
      signals: signals.total,
      signals_positive: signals.positive,
      cached,
      query_ms: Date.now() - startMs,
      version: VERSION,
    },
  };
}
