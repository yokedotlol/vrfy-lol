// ─── Main validation orchestrator (v1.0) ───
// Wires all validators together. POST-only for email validation.
// Options (force, quick) come from request body, not query params.

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
import { classifyLocalPart } from './validators/local-part-pattern';
import {
  checkDmarc, checkSpf, checkBimi, checkMtaSts,
  checkTlsRpt, checkDaneTlsa, checkDnssec,
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

/** Progress event for SSE streaming */
export interface ProgressEvent {
  stage: string;
  status: 'running' | 'complete' | 'skipped';
  detail?: string;
  elapsed_ms: number;
}

/** Progress callback for SSE streaming */
export type ProgressCallback = (event: ProgressEvent) => Promise<void>;

export interface ValidateOptions {
  /** Skip enrichment/security (Tier 1 only) */
  quick?: boolean;
  /** Bypass KV cache */
  force?: boolean;
  /** Admin key for signal visibility */
  adminKey?: string;
  /** Progress callback for SSE streaming */
  onProgress?: ProgressCallback;
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

  // Progress: syntax
  await options.onProgress?.({ stage: 'syntax', status: 'complete', elapsed_ms: Date.now() - startMs });

  if (!syntax.valid || !syntax.domain || !syntax.local_part) {
    // Invalid syntax — return immediately, no DNS needed
    return buildResponse(email, syntax, null, null, false, false, false, null, false, null, null, null, startMs, false, null, null, null, null, undefined);
  }

  const domain = syntax.domain;
  const localPart = syntax.local_part;
  const isIpLiteral = syntax.is_ip_literal;

  // IP literal addresses (e.g. user@[1.1.1.1]) — the IP IS the mail server.
  // No MX lookup, no domain heuristics, no caching. Syntactically valid per
  // RFC 5321 §4.1.3 but extremely unusual in practice.
  if (isIpLiteral) {
    const syntheticMx: MxResult = {
      has_mx: false,
      mx_records: [],
      null_mx: false,
      domain_exists: true, // IP exists by definition
      has_a_fallback: true, // the IP itself is the fallback
      error: null,
    };
    const roleAccount = isRoleAccount(localPart);
    const subaddress = detectSubaddress(localPart, domain);
    const spamTrap = checkSpamTrap(localPart);
    const lpPattern = classifyLocalPart(localPart);

    return buildResponse(
      email, syntax, syntheticMx, null, false, false,
      false, null, roleAccount,
      { has_typo: false, suggestion: null, original_domain: domain, suggested_domain: null, distance: null },
      null, subaddress, startMs, false,
      null, null,
      { risky_tld: false, tld: '', domain_entropy: 0, entropy_suspicious: false,
        spam_trap: spamTrap.is_spam_trap, spam_trap_pattern: spamTrap.pattern,
        mx_provider_class: 'self-hosted', mx_security_gateway: null },
      lpPattern,
      undefined,
    );
  }

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
    await options.onProgress?.({ stage: 'dns', status: 'complete', detail: 'cached', elapsed_ms: Date.now() - startMs });
    await options.onProgress?.({ stage: 'security', status: security ? 'complete' : 'skipped', detail: 'cached', elapsed_ms: Date.now() - startMs });
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
    const [mxResult, dmarcResult, spfResult, bimiResult, mtaStsResult, tlsRptResult, dnssecResult] = options.quick
      ? [await checkMx(domain), null, null, null, null, null, null]
      : await Promise.all([
          checkMx(domain),
          checkDmarc(domain),
          checkSpf(domain),
          checkBimi(domain),
          checkMtaSts(domain),
          checkTlsRpt(domain),
          checkDnssec(domain),
        ]);

    mx = mxResult;

    // Provider detection from MX
    provider = mx.has_mx ? detectProvider(mx.mx_records.map(r => r.host)) : null;

    await options.onProgress?.({
      stage: 'dns', status: 'complete',
      detail: mx.has_mx ? `${mx.mx_records.length} MX records` : mx.has_a_fallback ? 'A fallback' : 'no MX',
      elapsed_ms: Date.now() - startMs,
    });

    // Reconcile provider.is_free with the free-providers list.
    // MX-based detection can't distinguish Gmail from Google Workspace
    // (same MX hosts), so the domain-level free-provider check wins.
    if (provider && freeProvider && !provider.is_free) {
      provider = { ...provider, is_free: true };
    }

    // DANE TLSA needs MX hosts, so run after MX resolves
    const daneTlsaResult = (!options.quick && mx.has_mx)
      ? await checkDaneTlsa(mx.mx_records)
      : { found: false };

    // Build security result if we ran the checks
    if (dmarcResult && spfResult && bimiResult && mtaStsResult && tlsRptResult && dnssecResult) {
      security = buildSecurityResult(
        dmarcResult, spfResult, bimiResult, mtaStsResult,
        tlsRptResult, daneTlsaResult, dnssecResult,
      );
    }

    await options.onProgress?.({ stage: 'security', status: security ? 'complete' : 'skipped', elapsed_ms: Date.now() - startMs });

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
  const localPartPattern = classifyLocalPart(localPart);

  // Merge per-email spam trap into heuristics (domain part is cached, local part isn't)
  const emailHeuristics: HeuristicResult | null = heuristics
    ? {
        ...heuristics,
        spam_trap: spamTrap.is_spam_trap,
        spam_trap_pattern: spamTrap.pattern,
      }
    : null;

  // Assemble typo suggestion — verify suggested domain has MX before presenting
  let typoSuggestion: string | null = null;
  if (typo.has_typo && typo.suggested_domain) {
    const suggestedMx = await getDomainCache(env, typo.suggested_domain)
      ?? { mx: await checkMx(typo.suggested_domain) };
    if (suggestedMx.mx.has_mx || suggestedMx.mx.has_a_fallback) {
      typoSuggestion = `${localPart}@${typo.suggested_domain}`;
    }
    // If suggested domain can't receive mail, suppress the suggestion
  }

  // Step 5: Extended validation (if plugin is bound)
  let extendedResult: ExtendedResult | null = null;
  if (env.EXTENDED_VALIDATION && !options.quick) {
    await options.onProgress?.({ stage: 'extended', status: 'running', elapsed_ms: Date.now() - startMs });
    extendedResult = await callExtendedValidation(env, email, domain);
    await options.onProgress?.({ stage: 'extended', status: 'complete', elapsed_ms: Date.now() - startMs });
  } else {
    await options.onProgress?.({ stage: 'extended', status: 'skipped', elapsed_ms: Date.now() - startMs });
  }

  const extendedScore = extendedResult?.score ?? null;
  const isAdmin = !!(options.adminKey && env.ADMIN_KEY && options.adminKey === env.ADMIN_KEY);

  return buildResponse(
    email, syntax, mx, provider, disposable, freeProvider,
    privacyRelay, privacyRelayService, roleAccount,
    typo, typoSuggestion, subaddress, startMs, cached,
    extendedScore, security, emailHeuristics,
    localPartPattern,
    isAdmin ? extendedResult?.signals : undefined,
    isAdmin,
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
  localPartRandom: boolean,
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

  // Security signals
  if (security) {
    total++; if (security.spf) positive++;              // SPF present
    total++; if (security.dmarc.found) positive++;      // DMARC present
    total++; if (security.bimi) positive++;             // BIMI present
    total++; if (security.mta_sts) positive++;          // MTA-STS present
    total++; if (security.tls_rpt) positive++;          // TLS-RPT present
    total++; if (security.dane_tlsa) positive++;        // DANE TLSA present
    total++; if (security.dnssec) positive++;           // DNSSEC enabled
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

  // Local-part pattern signal
  total++; if (!localPartRandom) positive++;            // not random local-part

  // Extended validation (opaque score → binary signal)
  if (extendedScore !== null) {
    // The extended plugin checked N signals internally — we report
    // a fixed count since the plugin is opaque
    total += 13; // extended plugin: gravatar, github, xon, webfinger, pgp, keybase, libravatar, gitlab, microsoft, emailrep, wkd, openpgpkey_dns, smimea
    // Map opaque score to positive signal count proportionally
    // Max soft-OR score with 13 signals ≈ 0.976, so scale accordingly
    const maxScore = 0.976;
    const extPositive = Math.round((extendedScore / maxScore) * 13);
    positive += Math.min(extPositive, 13);
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
  localPartPattern: ReturnType<typeof classifyLocalPart> | null,
  adminSignals?: Record<string, boolean>,
  isAdmin?: boolean,
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
    is_ip_literal: syntax.is_ip_literal,
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
    is_ip_literal: syntax.is_ip_literal,
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

  // Random local-part → bump toward verify, reduce confidence
  if (localPartPattern?.is_random) {
    if (action === 'allow') action = 'verify';
    if (confidence === 'valid') confidence = 'likely_valid';
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
    // Immature domain → bump toward verify
    if (security.domain_maturity === 'none' && action === 'allow') {
      action = 'verify';
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
    localPartPattern?.is_random ?? false,
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
    is_ip_literal: syntax.is_ip_literal,
    is_internationalized: syntax.is_internationalized,
    is_punycode: syntax.domain ? /xn--/i.test(syntax.domain) : false,
    domain_type: syntax.is_ip_literal ? 'ip_literal' : syntax.domain ? 'domain' : null,
    local_part_pattern: localPartPattern?.classification ?? null,
    local_part_random: localPartPattern?.is_random ?? false,
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
      ...(isAdmin ? { cached } : {}),
      query_ms: Date.now() - startMs,
      version: VERSION,
    },
  };
}
