// ─── RFC 5321 Email Syntax Validation ───
// Full compliance including:
// - Dot-string and Quoted-string local parts (§4.1.2)
// - Local part max 64 octets
// - Domain LDH labels
// - Total address max 254 chars (§4.5.3.1.3, room for <> in SMTP envelope)
// - EAI/SMTPUTF8 per RFC 6531
// - IP literals
// - Mixed-script domain warnings

import type { SyntaxResult } from '../types';

const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const MAX_ADDRESS_LENGTH = 254;
const MAX_LABEL_LENGTH = 63;

/**
 * Validate an email address per RFC 5321.
 * Returns a structured result with specific failure reasons.
 */
export function validateSyntax(email: string): SyntaxResult {
  const warnings: string[] = [];

  if (!email || typeof email !== 'string') {
    return fail('Empty or invalid input');
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return fail('Empty email address');
  }

  if (trimmed.length > MAX_ADDRESS_LENGTH) {
    return fail(`Address exceeds maximum length of ${MAX_ADDRESS_LENGTH} characters (got ${trimmed.length})`);
  }

  // Split on the last @ to handle quoted local parts with @ inside
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) {
    return fail('Missing @ symbol');
  }
  if (atIndex === 0) {
    return fail('Empty local part');
  }
  if (atIndex === trimmed.length - 1) {
    return fail('Empty domain part');
  }

  const localPart = trimmed.substring(0, atIndex);
  const domainPart = trimmed.substring(atIndex + 1);

  // Check for internationalized content
  const hasNonAsciiLocal = /[^\x00-\x7F]/.test(localPart);
  const hasNonAsciiDomain = /[^\x00-\x7F]/.test(domainPart);
  const isInternationalized = hasNonAsciiLocal || hasNonAsciiDomain;

  // Validate local part
  const isQuoted = localPart.startsWith('"') && localPart.endsWith('"');
  let localValid: boolean;

  if (isQuoted) {
    localValid = validateQuotedLocalPart(localPart);
    warnings.push('Quoted local part — unusual but valid per RFC 5321');
  } else {
    localValid = validateDotStringLocalPart(localPart, hasNonAsciiLocal);
  }

  if (!localValid) {
    return fail('Invalid local part');
  }

  // Local part length check (octets, not chars for EAI)
  const localOctets = new TextEncoder().encode(localPart).length;
  if (localOctets > MAX_LOCAL_LENGTH) {
    return fail(`Local part exceeds ${MAX_LOCAL_LENGTH} octets (got ${localOctets})`);
  }

  // Validate domain part
  const isIpLiteral = domainPart.startsWith('[') && domainPart.endsWith(']');

  if (isIpLiteral) {
    if (!validateIpLiteral(domainPart)) {
      return fail('Invalid IP literal in domain');
    }
    warnings.push('IP literal domain — valid but unusual');
  } else {
    const domainError = validateDomainPart(domainPart, hasNonAsciiDomain);
    if (domainError) {
      return fail(domainError);
    }
  }

  // Check for mixed-script domain (homograph attack warning)
  if (hasNonAsciiDomain) {
    if (hasMixedScripts(domainPart)) {
      warnings.push('Mixed-script domain detected — potential homograph attack vector');
    }
  }

  // Normalize: lowercase domain, preserve local part case
  const normalizedDomain = isIpLiteral ? domainPart : domainPart.toLowerCase();
  const normalized = `${localPart}@${normalizedDomain}`;

  return {
    valid: true,
    normalized,
    local_part: localPart,
    domain: normalizedDomain,
    is_internationalized: isInternationalized,
    is_ip_literal: isIpLiteral,
    is_quoted_local: isQuoted,
    warnings,
    error: null,
  };
}

/**
 * Validate dot-string form local part (most common).
 * Allowed chars: atext per RFC 5321 — alphanumeric + !#$%&'*+-/=?^_`{|}~
 * Dots allowed but not at start/end, no consecutive dots.
 */
function validateDotStringLocalPart(local: string, allowUtf8: boolean): boolean {
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..')) return false;

  // atext = ALPHA / DIGIT / "!" / "#" / "$" / "%" / "&" / "'" /
  //         "*" / "+" / "-" / "/" / "=" / "?" / "^" / "_" /
  //         "`" / "{" / "|" / "}" / "~" / "."
  const atextPattern = allowUtf8
    ? /^[\p{L}\p{N}!#$%&'*+\-/=?^_`{|}~.]+$/u
    : /^[a-zA-Z0-9!#$%&'*+\-/=?^_`{|}~.]+$/;

  return atextPattern.test(local);
}

/**
 * Validate quoted-string form local part.
 * Inside quotes, most printable ASCII is allowed plus escaped characters.
 */
function validateQuotedLocalPart(local: string): boolean {
  if (local.length < 2) return false;

  // Strip surrounding quotes
  const inner = local.slice(1, -1);

  // Check for valid quoted content: printable ASCII except unescaped \ and "
  // Backslash escapes are allowed: \" and \\
  let i = 0;
  while (i < inner.length) {
    const ch = inner.charCodeAt(i);
    if (ch === 0x5C) { // backslash
      // Must be followed by another char
      if (i + 1 >= inner.length) return false;
      i += 2;
    } else if (ch === 0x22) { // unescaped quote
      return false;
    } else if (ch >= 0x20 && ch <= 0x7E) { // printable ASCII
      i++;
    } else {
      return false; // control chars not allowed
    }
  }
  return true;
}

/**
 * Validate domain part (hostname labels).
 * LDH rule: letters, digits, hyphens. No leading/trailing hyphens per label.
 * Max 253 chars total, max 63 per label, at least 2 labels.
 */
function validateDomainPart(domain: string, allowUtf8: boolean): string | null {
  if (domain.length > MAX_DOMAIN_LENGTH) {
    return `Domain exceeds ${MAX_DOMAIN_LENGTH} characters`;
  }

  const labels = domain.split('.');
  if (labels.length < 2) {
    return 'Domain must have at least two labels';
  }

  for (const label of labels) {
    if (label.length === 0) {
      return 'Empty label in domain (consecutive dots)';
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return `Domain label "${label}" exceeds ${MAX_LABEL_LENGTH} characters`;
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return `Domain label "${label}" cannot start or end with a hyphen`;
    }

    // LDH rule with optional unicode
    const labelPattern = allowUtf8
      ? /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u
      : /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

    if (!labelPattern.test(label)) {
      return `Invalid characters in domain label "${label}"`;
    }
  }

  // TLD must not be all numeric (prevents IP-like domains)
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld)) {
    return 'Top-level domain cannot be all numeric';
  }

  return null;
}

/**
 * Validate IP literal domain: [192.168.1.1] or [IPv6:2001:db8::1]
 */
function validateIpLiteral(domain: string): boolean {
  const inner = domain.slice(1, -1);

  // IPv6
  if (inner.startsWith('IPv6:')) {
    return isValidIpv6(inner.substring(5));
  }

  // IPv4
  return isValidIpv4(inner);
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return !isNaN(n) && n >= 0 && n <= 255 && p === String(n);
  });
}

function isValidIpv6(ip: string): boolean {
  // Basic IPv6 validation — expanded or compressed form
  // Allow :: shorthand, hex groups of 1-4 digits
  const parts = ip.split(':');
  if (parts.length < 2 || parts.length > 8) return false;
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  for (const part of parts) {
    if (part === '') continue; // from :: expansion
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
  }
  return true;
}

/**
 * Basic mixed-script detection for homograph attack warnings.
 * Checks if domain uses characters from multiple Unicode scripts.
 */
function hasMixedScripts(domain: string): boolean {
  const scripts = new Set<string>();
  for (const char of domain) {
    if (/[a-zA-Z]/.test(char)) scripts.add('Latin');
    else if (/[\u0400-\u04FF]/.test(char)) scripts.add('Cyrillic');
    else if (/[\u0370-\u03FF]/.test(char)) scripts.add('Greek');
    else if (/[\u4E00-\u9FFF]/.test(char)) scripts.add('CJK');
    else if (/[\u3040-\u309F\u30A0-\u30FF]/.test(char)) scripts.add('Japanese');
    else if (/[\uAC00-\uD7AF]/.test(char)) scripts.add('Korean');
    else if (/[\u0600-\u06FF]/.test(char)) scripts.add('Arabic');
    else if (/[\u0900-\u097F]/.test(char)) scripts.add('Devanagari');
    // dots and hyphens don't count as a script
  }
  return scripts.size > 1;
}

function fail(error: string): SyntaxResult {
  return {
    valid: false,
    normalized: null,
    local_part: null,
    domain: null,
    is_internationalized: false,
    is_ip_literal: false,
    is_quoted_local: false,
    warnings: [],
    error,
  };
}
