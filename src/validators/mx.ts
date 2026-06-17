// ─── MX & DNS checks via Cloudflare DoH ───
// Uses https://cloudflare-dns.com/dns-query for all DNS lookups.
// Checks MX records, A/AAAA fallback, Null MX (RFC 7505), domain existence.

import type { MxResult, MxRecord, DohResponse } from '../types';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT = 5000; // 5s timeout per query

// DNS record type constants
const TYPE_A = 1;
const TYPE_AAAA = 28;
const TYPE_MX = 15;
const TYPE_SOA = 6;

/**
 * Perform full MX/DNS checks for a domain.
 * Uses Cloudflare DoH for resolution.
 */
export async function checkMx(domain: string): Promise<MxResult> {
  try {
    // Parallel: MX + SOA (domain existence)
    const [mxResponse, soaResponse] = await Promise.all([
      queryDoh(domain, TYPE_MX),
      queryDoh(domain, TYPE_SOA),
    ]);

    // Check domain existence via NXDOMAIN status
    // Status 3 = NXDOMAIN
    const domainExists = mxResponse.Status !== 3 && soaResponse.Status !== 3;

    if (!domainExists) {
      return {
        has_mx: false,
        mx_records: [],
        null_mx: false,
        domain_exists: false,
        has_a_fallback: false,
        error: null,
      };
    }

    // Parse MX records
    const mxRecords = parseMxRecords(mxResponse);

    // Check for Null MX (RFC 7505): single MX record of "." at priority 0
    const nullMx = mxRecords.length === 1 &&
      mxRecords[0].priority === 0 &&
      (mxRecords[0].host === '.' || mxRecords[0].host === '');

    if (nullMx) {
      return {
        has_mx: false,
        mx_records: [],
        null_mx: true,
        domain_exists: true,
        has_a_fallback: false,
        error: null,
      };
    }

    if (mxRecords.length > 0) {
      return {
        has_mx: true,
        mx_records: mxRecords,
        null_mx: false,
        domain_exists: true,
        has_a_fallback: false,
        error: null,
      };
    }

    // No MX records — check for A/AAAA fallback (RFC 5321 §5.1)
    const [aResponse, aaaaResponse] = await Promise.all([
      queryDoh(domain, TYPE_A),
      queryDoh(domain, TYPE_AAAA),
    ]);

    const hasA = (aResponse.Answer?.length ?? 0) > 0;
    const hasAAAA = (aaaaResponse.Answer?.length ?? 0) > 0;
    const hasAFallback = hasA || hasAAAA;

    return {
      has_mx: false,
      mx_records: [],
      null_mx: false,
      domain_exists: true,
      has_a_fallback: hasAFallback,
      error: null,
    };
  } catch (err) {
    return {
      has_mx: false,
      mx_records: [],
      null_mx: false,
      domain_exists: false,
      has_a_fallback: false,
      error: err instanceof Error ? err.message : 'DNS lookup failed',
    };
  }
}

/**
 * Get MX hostnames for a domain.
 * Convenience wrapper for provider detection.
 */
export async function getMxHosts(domain: string): Promise<string[]> {
  const result = await checkMx(domain);
  return result.mx_records.map(r => r.host);
}

/**
 * Query Cloudflare DoH endpoint.
 * Returns structured DNS response.
 */
async function queryDoh(name: string, type: number): Promise<DohResponse> {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set('name', name);
  url.searchParams.set('type', String(type));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOH_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/dns-json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DoH query failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as DohResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse MX records from DoH response.
 * MX data format: "10 mx.example.com." (priority space host)
 * Returns sorted by priority (ascending).
 */
function parseMxRecords(response: DohResponse): MxRecord[] {
  if (!response.Answer) return [];

  const records: MxRecord[] = [];
  for (const answer of response.Answer) {
    if (answer.type !== TYPE_MX) continue;

    const parts = answer.data.split(/\s+/);
    if (parts.length < 2) continue;

    const priority = parseInt(parts[0], 10);
    const host = parts[1].replace(/\.$/, ''); // strip trailing dot

    if (!isNaN(priority)) {
      records.push({ priority, host });
    }
  }

  return records.sort((a, b) => a.priority - b.priority);
}

/**
 * Resolve MX hosts to IP addresses.
 * Used for DNSBL lookups (Phase 2).
 */
export async function resolveMxToIps(mxHosts: string[]): Promise<string[]> {
  const ips = new Set<string>();
  const queries = mxHosts.flatMap(host => [
    queryDoh(host, TYPE_A),
    queryDoh(host, TYPE_AAAA),
  ]);

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.Answer) {
      for (const answer of result.Answer) {
        if (answer.type === TYPE_A || answer.type === TYPE_AAAA) {
          ips.add(answer.data);
        }
      }
    }
  }

  return [...ips];
}
