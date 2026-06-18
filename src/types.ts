// ─── vrfy.lol v1.0 type definitions ───

import type { PowSolution } from './pow';

/** Admin-only diagnostic payload (requires X-Admin-Key header) */
export interface AdminResult {
  existence_signals?: Record<string, boolean>;
}

/** Top-level validation response */
export interface VrfyResponse {
  email: string;
  action: Action;
  confidence: Confidence;
  validation: ValidationResult;
  security?: SecurityResult;
  heuristics?: HeuristicResult;
  _admin?: AdminResult;
  _meta: MetaResult;
}

export type Action = 'allow' | 'verify' | 'block';

export type Confidence = 'valid' | 'likely_valid' | 'risky' | 'invalid' | 'unknown';

/** Tier 1 — Core validation signals */
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
  /** Domain part is an IP literal ([1.1.1.1] or [IPv6:...]) */
  is_ip_literal: boolean;
  /** Domain uses internationalized characters (EAI/SMTPUTF8) */
  is_internationalized: boolean;
  /** Domain contains punycode-encoded labels (xn--) */
  is_punycode: boolean;
  /** Domain type classification */
  domain_type: 'domain' | 'ip_literal' | null;
  /** Local-part structural pattern classification */
  local_part_pattern: string | null;
  /** Whether the local part appears auto-generated / random */
  local_part_random: boolean;
}

/** Provider identification with behavior hints */
export interface ProviderInfo {
  name: string;
  is_free: boolean;
  catch_all_default: boolean;
  smtp_verification: 'reliable' | 'unreliable' | 'blocked' | 'unknown';
  note: string;
}

/** Phase 1 heuristic signals — local computation, no network */
export interface HeuristicResult {
  risky_tld: boolean;
  tld: string;
  domain_entropy: number;
  entropy_suspicious: boolean;
  spam_trap: boolean;
  spam_trap_pattern: string | null;
  mx_provider_class: 'enterprise' | 'consumer' | 'self-hosted' | 'forwarding' | 'unknown';
  mx_security_gateway: string | null;
}

/** Tier 3 — Email security posture */
export interface SecurityResult {
  grade: string;
  spf: boolean;
  dkim: boolean;
  dkim_selectors: string[];
  dmarc: DmarcResult;
  mta_sts: boolean;
  tls_rpt: boolean;
  dane_tlsa: boolean;
  dnssec: boolean;
  bimi: boolean;
  /** Coarse domain maturity gate: mature/basic/minimal/none */
  domain_maturity: 'mature' | 'basic' | 'minimal' | 'none';
}

export interface DmarcResult {
  found: boolean;
  policy: string | null;
}

/** Response metadata — v1.0: includes signals and signals_positive */
export interface MetaResult {
  signals: number;
  signals_positive: number;
  cached: boolean;
  query_ms: number;
  version: string;
}

// ─── Request types ───

/** POST / request body */
export interface ValidateRequest {
  email: string;
  /** Bypass cache */
  force?: boolean;
  /** Tier 1 only, skip enrichment/security */
  quick?: boolean;
  /** Response mode: 'quick' (Tier 1 only) or 'full' (all signals, default). Alias for quick flag. */
  mode?: 'quick' | 'full';
  /** Stream progress events via SSE (text/event-stream) */
  stream?: boolean;
  /** PoW solution (required after rate limit exceeded) */
  pow?: PowSolution;
}

/** POST /batch request body */
export interface BatchRequest {
  emails: string[];
  force?: boolean;
  quick?: boolean;
  /** Response mode: 'quick' (Tier 1 only) or 'full' (all signals, default). Alias for quick flag. */
  mode?: 'quick' | 'full';
  pow?: PowSolution;
}

export interface BatchResponse {
  results: VrfyResponse[];
  batch_ms: number;
  domains_queried: number;
}

// ─── Internal types used during validation ───

export interface SyntaxResult {
  valid: boolean;
  normalized: string | null;
  local_part: string | null;
  domain: string | null;
  is_internationalized: boolean;
  is_ip_literal: boolean;
  is_quoted_local: boolean;
  warnings: string[];
  error: string | null;
}

export interface MxResult {
  has_mx: boolean;
  mx_records: MxRecord[];
  null_mx: boolean;
  domain_exists: boolean;
  has_a_fallback: boolean;
  error: string | null;
}

export interface MxRecord {
  priority: number;
  host: string;
}

export interface TypoResult {
  has_typo: boolean;
  suggestion: string | null;
  original_domain: string;
  suggested_domain: string | null;
  distance: number | null;
}

export interface PrivacyRelayResult {
  is_privacy_relay: boolean;
  service: string | null;
}

export interface SubaddressResult {
  is_subaddressed: boolean;
  tag: string | null;
  base_address: string | null;
}

export interface DisposableResult {
  is_disposable: boolean;
  source: 'bundled' | 'api' | null;
}

/** Worker environment bindings */
export interface Env {
  CACHE: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  /** HMAC key for email-level cache keys */
  CACHE_SECRET: string;
  /** HMAC key for PoW challenge generation */
  POW_SECRET: string;
  /** Optional admin key for signal visibility (set via wrangler secret) */
  ADMIN_KEY?: string;
  /** Optional extended validation service binding (closed-source plugin) */
  EXTENDED_VALIDATION?: Fetcher;
  // Phase 2+
  // FLY_AUTH_SECRET: string;
  // PROBE_URL: string;
}

/** Domain-level cache entry */
export interface DomainCacheEntry {
  mx: MxResult;
  provider: ProviderInfo | null;
  is_disposable: boolean;
  is_free_provider: boolean;
  is_privacy_relay: boolean;
  privacy_relay_service: string | null;
  security: SecurityResult | null;
  heuristics: HeuristicResult | null;
  cached_at: number;
}

/** DoH DNS response format */
export interface DohResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: DohQuestion[];
  Answer?: DohAnswer[];
  Authority?: DohAnswer[];
}

export interface DohQuestion {
  name: string;
  type: number;
}

export interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

/** DNS record types used */
export const DNS_TYPE = {
  A: 1,
  AAAA: 28,
  MX: 15,
  TXT: 16,
  SOA: 6,
  NS: 2,
} as const;
