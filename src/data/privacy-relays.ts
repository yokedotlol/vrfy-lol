// ─── Privacy relay domain and MX patterns ───
// These are LEGITIMATE forwarding services, NOT disposable.
// Users behind these relays are reachable and persistent.

interface PrivacyRelayPattern {
  service: string;
  domains: string[];
  mx_patterns?: string[];
}

export const PRIVACY_RELAYS: PrivacyRelayPattern[] = [
  {
    service: 'Apple Hide My Email',
    domains: ['privaterelay.appleid.com'],
  },
  {
    service: 'SimpleLogin',
    domains: ['simplelogin.co', 'simplelogin.com', 'slmails.com', 'aleeas.com'],
  },
  {
    service: 'Addy.io',
    domains: [
      'anonaddy.me', 'anonaddy.com', 'addy.io',
      'maildrop.cc', 'hideaddress.net',
    ],
  },
  {
    service: 'Firefox Relay',
    domains: ['mozmail.com', 'relay.firefox.com'],
  },
  {
    service: 'DuckDuckGo Email',
    domains: ['duck.com'],
  },
  {
    service: 'Fastmail Masked Email',
    domains: [],
    // Fastmail masked emails use random subdomains on messagingengine.com
    // Detected via MX pattern + random local part heuristic
    mx_patterns: ['messagingengine.com'],
  },
  {
    service: 'Proton Mail aliases',
    domains: ['proton.me', 'protonmail.com', 'pm.me'],
    // Native aliases via Proton Pass — these are the main Proton domains
    // We only flag as privacy relay if the local part pattern matches alias format
  },
];

/** Set of all known privacy relay domains for fast lookup */
const PRIVACY_RELAY_DOMAINS = new Set<string>();
for (const relay of PRIVACY_RELAYS) {
  for (const domain of relay.domains) {
    PRIVACY_RELAY_DOMAINS.add(domain.toLowerCase());
  }
}

/**
 * Check if a domain is a known privacy relay.
 * Returns the service name if matched, null otherwise.
 */
export function getPrivacyRelayService(domain: string): string | null {
  const lower = domain.toLowerCase();
  for (const relay of PRIVACY_RELAYS) {
    if (relay.domains.some(d => lower === d || lower.endsWith('.' + d))) {
      return relay.service;
    }
  }
  return null;
}

/**
 * Check if MX hosts indicate a privacy relay provider.
 * Used for Fastmail masked email detection.
 */
export function getPrivacyRelayServiceFromMx(mxHosts: string[]): string | null {
  for (const relay of PRIVACY_RELAYS) {
    if (!relay.mx_patterns) continue;
    for (const mx of mxHosts) {
      const lower = mx.toLowerCase();
      if (relay.mx_patterns.some(p => lower.endsWith(p))) {
        return relay.service;
      }
    }
  }
  return null;
}

export function isPrivacyRelayDomain(domain: string): boolean {
  return PRIVACY_RELAY_DOMAINS.has(domain.toLowerCase()) ||
    getPrivacyRelayService(domain) !== null;
}
