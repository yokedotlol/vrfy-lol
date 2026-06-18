// ─── Confidence classification ───
// Honest about what DNS can and can't tell you.
// The word "deliverable" never appears — we don't probe mailboxes.
//
// Levels:
//   valid       — Very likely to accept mail
//   likely_valid — Probably accepts mail, some unknowns
//   risky       — Possible issues
//   invalid     — Cannot receive mail
//   unknown     — Insufficient data

import type { Confidence, MxResult, ProviderInfo } from '../types';

interface ConfidenceInput {
  syntax_valid: boolean;
  mx: MxResult;
  is_disposable: boolean;
  is_privacy_relay: boolean;
  is_role_account: boolean;
  is_free_provider: boolean;
  provider: ProviderInfo | null;
  has_typo: boolean;
  is_ip_literal?: boolean;
  // Phase 2: domain_age_days, dnsbl_listed
}

/**
 * Classify confidence level based on combined signals.
 */
export function classifyConfidence(input: ConfidenceInput): Confidence {
  // ─── Invalid — cannot receive mail ───
  if (!input.syntax_valid) return 'invalid';

  // IP literals are RFC-valid but we can't verify anything via DNS
  if (input.is_ip_literal) return 'risky';

  if (!input.mx.domain_exists) return 'invalid';
  if (input.mx.null_mx) return 'invalid';
  if (!input.mx.has_mx && !input.mx.has_a_fallback) return 'invalid';

  // ─── Risky — possible issues ───
  if (input.is_disposable) return 'risky';
  if (input.has_typo) return 'risky';
  if (input.is_role_account && input.is_free_provider) return 'risky';
  // Phase 2: newly registered domain (< 30 days), DNSBL-listed

  // ─── Valid — high confidence ───
  // Recognized provider + MX resolves + not disposable
  if (input.mx.has_mx && input.provider && !input.is_privacy_relay) {
    return 'valid';
  }

  // MX resolves + recognized free provider (gmail.com, outlook.com, etc.)
  if (input.mx.has_mx && input.is_free_provider) {
    return 'valid';
  }

  // ─── Likely valid — MX exists but limited signals ───
  if (input.mx.has_mx) {
    return 'likely_valid';
  }

  // A/AAAA fallback (no MX record but domain resolves) — lower confidence
  if (input.mx.has_a_fallback) {
    return 'likely_valid';
  }

  // ─── Unknown — can't determine ───
  return 'unknown';
}
