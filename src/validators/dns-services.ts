// ─── DNS SRV / service discovery checks ───
// Checks for email-related SRV records that indicate what services a domain offers.
// All via Cloudflare DoH — no privacy risk, fast, cacheable.

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT = 4000;
const TYPE_SRV = 33;
const TYPE_NS = 2;

// ─── SRV record checks ───

export interface SrvService {
  name: string;
  found: boolean;
  host: string | null;
  port: number | null;
}

export interface DnsServicesResult {
  /** SRV records for email-related services */
  services: SrvService[];
  /** Count of services found */
  services_found: number;
  /** Whether any submission service is present (SMTP submission, IMAP, JMAP) */
  has_submission: boolean;
  /** Whether IMAP access is advertised */
  has_imap: boolean;
  /** Whether the domain uses Autodiscover (Exchange) */
  has_autodiscover: boolean;
  /** Whether JMAP (modern API-based email) is advertised */
  has_jmap: boolean;
}

const SRV_CHECKS: Array<{ label: string; name: string }> = [
  { label: 'submission', name: '_submission._tcp' },
  { label: 'imap', name: '_imap._tcp' },
  { label: 'imaps', name: '_imaps._tcp' },
  { label: 'pop3', name: '_pop3._tcp' },
  { label: 'pop3s', name: '_pop3s._tcp' },
  { label: 'jmap', name: '_jmap._tcp' },
  { label: 'autodiscover', name: '_autodiscover._tcp' },
];

export async function checkDnsServices(domain: string): Promise<DnsServicesResult> {
  const queries = SRV_CHECKS.map(async (check): Promise<SrvService> => {
    try {
      const resp = await queryDoh(`${check.name}.${domain}`, TYPE_SRV);
      const answer = resp.Answer?.find(a => a.type === TYPE_SRV);
      if (answer) {
        // SRV data: "priority weight port target"
        const parts = answer.data.split(/\s+/);
        const port = parts.length >= 3 ? parseInt(parts[2], 10) : null;
        const host = parts.length >= 4 ? parts[3].replace(/\.$/, '') : null;
        // SRV with target "." means "service not available"
        if (host === '' || host === '.') {
          return { name: check.label, found: false, host: null, port: null };
        }
        return { name: check.label, found: true, host, port };
      }
      return { name: check.label, found: false, host: null, port: null };
    } catch {
      return { name: check.label, found: false, host: null, port: null };
    }
  });

  const services = await Promise.all(queries);
  const found = services.filter(s => s.found);

  return {
    services,
    services_found: found.length,
    has_submission: found.some(s => s.name === 'submission'),
    has_imap: found.some(s => s.name === 'imap' || s.name === 'imaps'),
    has_autodiscover: found.some(s => s.name === 'autodiscover'),
    has_jmap: found.some(s => s.name === 'jmap'),
  };
}

// ─── NS hosting provider detection ───

export interface NsProviderResult {
  provider: string | null;
  nameservers: string[];
}

const NS_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
  { pattern: /\.cloudflare\.com$/i, provider: 'Cloudflare' },
  { pattern: /\.awsdns-/i, provider: 'AWS Route 53' },
  { pattern: /\.googledomains\.com$/i, provider: 'Google Domains' },
  { pattern: /\.google\.com$/i, provider: 'Google Cloud DNS' },
  { pattern: /\.azure-dns\./i, provider: 'Azure DNS' },
  { pattern: /\.digitalocean\.com$/i, provider: 'DigitalOcean' },
  { pattern: /\.linode\.com$/i, provider: 'Linode (Akamai)' },
  { pattern: /\.hetzner\./i, provider: 'Hetzner' },
  { pattern: /\.vultr\.com$/i, provider: 'Vultr' },
  { pattern: /\.namecheap/i, provider: 'Namecheap' },
  { pattern: /\.registrar-servers\.com$/i, provider: 'Namecheap' },
  { pattern: /\.domaincontrol\.com$/i, provider: 'GoDaddy' },
  { pattern: /\.godaddy\.com$/i, provider: 'GoDaddy' },
  { pattern: /\.name-services\.com$/i, provider: 'Enom' },
  { pattern: /\.hover\.com$/i, provider: 'Hover' },
  { pattern: /\.dnsimple\.com$/i, provider: 'DNSimple' },
  { pattern: /\.nsone\.net$/i, provider: 'NS1 (IBM)' },
  { pattern: /\.dynect\.net$/i, provider: 'Oracle Dyn' },
  { pattern: /\.ultradns\./i, provider: 'UltraDNS (Vercara)' },
  { pattern: /\.ovh\./i, provider: 'OVH' },
  { pattern: /\.gandi\.net$/i, provider: 'Gandi' },
  { pattern: /\.vercel-dns\.com$/i, provider: 'Vercel' },
  { pattern: /\.netlify\.com$/i, provider: 'Netlify' },
  { pattern: /\.squarespace/i, provider: 'Squarespace' },
  { pattern: /\.wixdns\.net$/i, provider: 'Wix' },
  { pattern: /\.wordpress\.com$/i, provider: 'WordPress.com' },
  { pattern: /\.wpengine\.com$/i, provider: 'WP Engine' },
  { pattern: /\.shopify/i, provider: 'Shopify' },
  { pattern: /\.dnsmadeeasy\.com$/i, provider: 'DNS Made Easy' },
  { pattern: /\.he\.net$/i, provider: 'Hurricane Electric' },
  { pattern: /\.porkbun\.com$/i, provider: 'Porkbun' },
  { pattern: /\.1and1\./i, provider: 'IONOS' },
  { pattern: /\.ui-dns\.com$/i, provider: 'IONOS' },
];

export async function detectNsProvider(domain: string): Promise<NsProviderResult> {
  try {
    const resp = await queryDoh(domain, TYPE_NS);
    const nameservers = (resp.Answer ?? [])
      .filter(a => a.type === TYPE_NS)
      .map(a => a.data.replace(/\.$/, '').toLowerCase());

    if (nameservers.length === 0) {
      return { provider: null, nameservers: [] };
    }

    // Match against known patterns — use first NS as primary signal
    for (const ns of nameservers) {
      for (const { pattern, provider } of NS_PATTERNS) {
        if (pattern.test(ns)) {
          return { provider, nameservers };
        }
      }
    }

    return { provider: null, nameservers };
  } catch {
    return { provider: null, nameservers: [] };
  }
}

// ─── Subdomain email detection ───

export interface SubdomainResult {
  /** Whether the email domain appears to be a subdomain */
  is_subdomain: boolean;
  /** The detected parent domain (null if not a subdomain or can't determine) */
  parent_domain: string | null;
  /** How many label levels deep (e.g., mail.corp.example.com = 2) */
  depth: number;
}

// Effective TLD list — common multi-part TLDs
const MULTI_TLDS = new Set([
  'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.in', 'co.id',
  'com.au', 'com.br', 'com.cn', 'com.mx', 'com.sg', 'com.tw', 'com.hk',
  'com.ar', 'com.co', 'com.tr', 'com.my', 'com.ph', 'com.pk', 'com.ng',
  'org.uk', 'org.au', 'net.au', 'gov.uk', 'ac.uk', 'me.uk',
  'ne.jp', 'or.jp', 'ac.jp', 'ed.jp',
  'gov.au', 'gov.br', 'gov.cn', 'gov.in',
  'edu.au', 'edu.cn',
]);

export function detectSubdomain(domain: string): SubdomainResult {
  const parts = domain.toLowerCase().split('.');

  if (parts.length <= 2) {
    return { is_subdomain: false, parent_domain: null, depth: 0 };
  }

  // Check for multi-part TLD
  const last2 = parts.slice(-2).join('.');
  const isMultiTld = MULTI_TLDS.has(last2);

  const minParts = isMultiTld ? 3 : 2;
  if (parts.length <= minParts) {
    return { is_subdomain: false, parent_domain: null, depth: 0 };
  }

  const parentDomain = parts.slice(-(minParts)).join('.');
  const depth = parts.length - minParts;

  return {
    is_subdomain: true,
    parent_domain: parentDomain,
    depth,
  };
}

// ─── Domain age via RDAP ───

export interface DomainAgeResult {
  /** Registration date (ISO string) or null if unavailable */
  registered: string | null;
  /** Domain age in days, or null */
  age_days: number | null;
  /** Whether the domain is less than 30 days old */
  is_new: boolean;
  /** Whether the domain is less than 90 days old */
  is_young: boolean;
}

// Direct RDAP server map for common TLDs (skip rdap.org redirect)
const RDAP_SERVERS: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.org/domain/',
  io: 'https://rdap.nic.io/domain/',
  dev: 'https://rdap.nic.google/domain/',
  app: 'https://rdap.nic.google/domain/',
  lol: 'https://rdap.nic.google/domain/',
  co: 'https://rdap.nic.co/domain/',
  me: 'https://rdap.nic.me/domain/',
  cc: 'https://rdap.verisign.com/cc/v1/domain/',
  tv: 'https://rdap.verisign.com/tv/v1/domain/',
};
const RDAP_FALLBACK = 'https://rdap.org/domain/';
const RDAP_TIMEOUT = 8000;

export async function checkDomainAge(domain: string): Promise<DomainAgeResult> {
  const empty: DomainAgeResult = { registered: null, age_days: null, is_new: false, is_young: false };

  try {
    // Get the registrable domain (strip subdomains)
    const sub = detectSubdomain(domain);
    const queryDomain = sub.is_subdomain && sub.parent_domain ? sub.parent_domain : domain;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RDAP_TIMEOUT);

    try {
      const tld = queryDomain.split('.').pop()?.toLowerCase() ?? '';
      const rdapBase = RDAP_SERVERS[tld] ?? RDAP_FALLBACK;
      const resp = await fetch(`${rdapBase}${queryDomain}`, {
        headers: { 'Accept': 'application/rdap+json' },
        signal: controller.signal,
      });

      if (!resp.ok) return empty;

      const data = await resp.json() as RdapResponse;

      // Look for registration event
      const regEvent = data.events?.find(
        e => e.eventAction === 'registration'
      );

      if (!regEvent?.eventDate) return empty;

      const regDate = new Date(regEvent.eventDate);
      if (isNaN(regDate.getTime())) return empty;

      const ageDays = Math.floor((Date.now() - regDate.getTime()) / 86400000);

      return {
        registered: regDate.toISOString().slice(0, 10),
        age_days: ageDays,
        is_new: ageDays < 30,
        is_young: ageDays < 90,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return empty;
  }
}

interface RdapResponse {
  events?: Array<{
    eventAction: string;
    eventDate: string;
  }>;
}

// ─── DoH helper ───

async function queryDoh(name: string, type: number): Promise<{ Status: number; Answer?: Array<{ type: number; data: string }> }> {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set('name', name);
  url.searchParams.set('type', String(type));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOH_TIMEOUT);

  try {
    const resp = await fetch(url.toString(), {
      headers: { 'Accept': 'application/dns-json' },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`DoH ${resp.status}`);
    return await resp.json() as { Status: number; Answer?: Array<{ type: number; data: string }> };
  } finally {
    clearTimeout(timeout);
  }
}
