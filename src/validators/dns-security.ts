// ─── DNS security posture checks ───
// DMARC, SPF, BIMI, MTA-STS — all via Cloudflare DoH.
// These are pure DNS lookups: free, fast, cacheable, zero privacy risk.
// Fail-open: if a query fails, the signal is absent, not an error.

import type { DohResponse, SecurityResult } from '../types';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT = 5000;
const TYPE_TXT = 16;

// ─── Individual checks ───

export interface DmarcCheckResult {
  found: boolean;
  policy: string | null; // 'none' | 'quarantine' | 'reject'
}

export interface SpfCheckResult {
  found: boolean;
  qualifier: string | null; // '-all' | '~all' | '?all' | '+all'
}

export interface BimiCheckResult {
  found: boolean;
}

export interface MtaStsCheckResult {
  found: boolean;
}

/**
 * Check DMARC policy at _dmarc.{domain}.
 * Parses the p= tag to get the enforcement policy.
 */
export async function checkDmarc(domain: string): Promise<DmarcCheckResult> {
  try {
    const response = await queryDoh(`_dmarc.${domain}`, TYPE_TXT);
    const txt = extractTxtRecords(response);

    for (const record of txt) {
      if (!record.toLowerCase().startsWith('v=dmarc1')) continue;

      // Parse p= tag
      const pMatch = record.match(/;\s*p\s*=\s*(none|quarantine|reject)/i);
      return {
        found: true,
        policy: pMatch ? pMatch[1].toLowerCase() : null,
      };
    }

    return { found: false, policy: null };
  } catch {
    return { found: false, policy: null };
  }
}

/**
 * Check SPF record at {domain} TXT.
 * Looks for v=spf1 and parses the -all/~all/etc qualifier.
 */
export async function checkSpf(domain: string): Promise<SpfCheckResult> {
  try {
    const response = await queryDoh(domain, TYPE_TXT);
    const txt = extractTxtRecords(response);

    for (const record of txt) {
      if (!record.toLowerCase().startsWith('v=spf1')) continue;

      // Parse the trailing all mechanism
      const allMatch = record.match(/([+\-~?])all\s*$/i);
      return {
        found: true,
        qualifier: allMatch ? `${allMatch[1]}all` : null,
      };
    }

    return { found: false, qualifier: null };
  } catch {
    return { found: false, qualifier: null };
  }
}

/**
 * Check BIMI record at default._bimi.{domain}.
 * BIMI (Brand Indicators for Message Identification) indicates
 * the domain has invested in verified brand identity for email.
 */
export async function checkBimi(domain: string): Promise<BimiCheckResult> {
  try {
    const response = await queryDoh(`default._bimi.${domain}`, TYPE_TXT);
    const txt = extractTxtRecords(response);

    for (const record of txt) {
      if (record.toLowerCase().startsWith('v=bimi1')) {
        return { found: true };
      }
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Check MTA-STS record at _mta-sts.{domain}.
 * MTA-STS (RFC 8461) indicates the domain enforces TLS for inbound mail.
 */
export async function checkMtaSts(domain: string): Promise<MtaStsCheckResult> {
  try {
    const response = await queryDoh(`_mta-sts.${domain}`, TYPE_TXT);
    const txt = extractTxtRecords(response);

    for (const record of txt) {
      if (record.toLowerCase().startsWith('v=stsv1')) {
        return { found: true };
      }
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

// ─── Security grading ───

/**
 * Grade the domain's email security posture based on DNS records.
 *
 * A+: DMARC reject + SPF -all + BIMI + MTA-STS
 * A:  DMARC reject + SPF -all (or ~all)
 * B:  DMARC quarantine + SPF present
 * C:  DMARC none + SPF, or DMARC quarantine without strict SPF
 * D:  SPF only, no DMARC
 * F:  Nothing
 */
export function gradeSecurityPosture(
  dmarc: DmarcCheckResult,
  spf: SpfCheckResult,
  bimi: BimiCheckResult,
  mtaSts: MtaStsCheckResult,
): string {
  const dmarcPolicy = dmarc.policy;
  const spfStrict = spf.qualifier === '-all';
  const spfPresent = spf.found;

  // A+: Full lockdown
  if (dmarcPolicy === 'reject' && spfStrict && bimi.found && mtaSts.found) {
    return 'A+';
  }

  // A: Strong enforcement
  if (dmarcPolicy === 'reject' && spfPresent) {
    return 'A';
  }

  // B: Moderate enforcement
  if (dmarcPolicy === 'quarantine' && spfPresent) {
    return 'B';
  }

  // C: Monitoring / partial
  if (dmarcPolicy === 'none' && spfPresent) {
    return 'C';
  }
  if (dmarcPolicy === 'quarantine' && !spfPresent) {
    return 'C';
  }

  // D: Minimal (SPF only)
  if (spfPresent && !dmarc.found) {
    return 'D';
  }

  // F: Nothing useful
  return 'F';
}

/**
 * Build the full SecurityResult from individual checks.
 */
export function buildSecurityResult(
  dmarc: DmarcCheckResult,
  spf: SpfCheckResult,
  bimi: BimiCheckResult,
  mtaSts: MtaStsCheckResult,
): SecurityResult {
  return {
    grade: gradeSecurityPosture(dmarc, spf, bimi, mtaSts),
    spf: spf.found,
    dkim: false, // Phase 2 — requires probing specific selectors
    dkim_selectors: [],
    dmarc: { found: dmarc.found, policy: dmarc.policy },
    mta_sts: mtaSts.found,
    tls_rpt: false, // Phase 2
    bimi: bimi.found,
  };
}

// ─── DoH helpers ───

async function queryDoh(name: string, type: number): Promise<DohResponse> {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set('name', name);
  url.searchParams.set('type', String(type));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOH_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/dns-json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DoH query failed: ${response.status}`);
    }

    return await response.json() as DohResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract TXT record data from a DoH response.
 * TXT data comes as quoted strings: "v=spf1 ..." — strip the quotes.
 * Multi-part TXT records (RFC 7208 §3.3) are concatenated.
 */
function extractTxtRecords(response: DohResponse): string[] {
  if (!response.Answer) return [];

  const results: string[] = [];
  for (const answer of response.Answer) {
    if (answer.type !== TYPE_TXT) continue;
    // DoH JSON returns TXT data with surrounding quotes; strip them
    // Multi-string TXT records appear as "part1" "part2" — concatenate
    const cleaned = answer.data
      .replace(/^"/, '')
      .replace(/"$/, '')
      .replace(/" "/g, '');
    results.push(cleaned);
  }

  return results;
}
