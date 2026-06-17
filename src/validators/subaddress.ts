// ─── Subaddress detection ───
// Detect plus-addressing (user+tag@domain) and Yahoo-style dash-addressing.

import type { SubaddressResult } from '../types';

// Providers known to support +tag subaddressing
const PLUS_SUBADDRESS_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'fastmail.com', 'fastmail.fm',
  'protonmail.com', 'proton.me', 'pm.me',
  'icloud.com', 'me.com', 'mac.com',
  'zoho.com', 'zohomail.com',
  'tutanota.com', 'tuta.io',
  'hey.com',
  'posteo.de', 'posteo.net',
  'disroot.org',
  'mailfence.com',
  'runbox.com',
]);

// Providers known to support -tag subaddressing
const DASH_SUBADDRESS_PROVIDERS = new Set([
  'yahoo.com', 'ymail.com', 'rocketmail.com',
]);

/**
 * Detect subaddressing in an email.
 * Gmail/Outlook/etc use +tag, Yahoo uses -tag.
 *
 * Returns the base address (without tag) and the tag itself.
 */
export function detectSubaddress(
  localPart: string,
  domain: string,
): SubaddressResult {
  const lowerDomain = domain.toLowerCase();

  // Check +tag (most providers)
  const plusIndex = localPart.indexOf('+');
  if (plusIndex > 0 && PLUS_SUBADDRESS_PROVIDERS.has(lowerDomain)) {
    const base = localPart.substring(0, plusIndex);
    const tag = localPart.substring(plusIndex + 1);
    return {
      is_subaddressed: true,
      tag,
      base_address: `${base}@${domain}`,
    };
  }

  // Check -tag (Yahoo)
  const dashIndex = localPart.indexOf('-');
  if (dashIndex > 0 && DASH_SUBADDRESS_PROVIDERS.has(lowerDomain)) {
    const base = localPart.substring(0, dashIndex);
    const tag = localPart.substring(dashIndex + 1);
    return {
      is_subaddressed: true,
      tag,
      base_address: `${base}@${domain}`,
    };
  }

  // Also detect +tag even on unknown providers — it's a widely adopted convention
  if (plusIndex > 0) {
    const base = localPart.substring(0, plusIndex);
    const tag = localPart.substring(plusIndex + 1);
    return {
      is_subaddressed: true,
      tag,
      base_address: `${base}@${domain}`,
    };
  }

  return {
    is_subaddressed: false,
    tag: null,
    base_address: null,
  };
}
