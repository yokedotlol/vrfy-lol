// ─── Action field logic ───
// The single most useful field in the response.
// Tells a developer what to DO, not just what IS.
//
// Decision logic:
// - block:  Invalid syntax, no MX, null MX, disposable domain
// - verify: Privacy relay, role account, free provider + role, catch-all, typo detected
// - allow:  Passes all validation checks

import type { Action, MxResult } from '../types';

interface ActionInput {
  syntax_valid: boolean;
  mx: MxResult;
  is_disposable: boolean;
  is_privacy_relay: boolean;
  is_role_account: boolean;
  is_free_provider: boolean;
  has_typo: boolean;
  catch_all_likely: boolean;
  is_ip_literal?: boolean;
}

/**
 * Determine the recommended action based on all validation signals.
 *
 * Priority order (first match wins):
 * 1. block — hard failures, cannot receive mail
 * 2. verify — soft signals suggesting extra verification
 * 3. allow — everything looks good
 */
export function determineAction(input: ActionInput): Action {
  // ─── Block conditions ───
  if (!input.syntax_valid) return 'block';
  if (!input.mx.domain_exists) return 'block';
  if (input.mx.null_mx) return 'block';
  if (!input.mx.has_mx && !input.mx.has_a_fallback) return 'block';
  if (input.is_disposable) return 'block';

  // ─── Verify conditions ───
  if (input.is_ip_literal) return 'verify'; // RFC-valid but extremely unusual
  if (input.has_typo) return 'verify';
  if (input.is_privacy_relay) return 'verify';
  if (input.is_role_account) return 'verify';

  // Catch-all on known free providers (Gmail, Yahoo, etc.) is expected
  // behavior — don't penalize the user for their provider's default.
  if (input.catch_all_likely && !input.is_free_provider) return 'verify';

  // ─── Allow ───
  return 'allow';
}
