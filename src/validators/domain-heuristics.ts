// ─── Domain heuristic checks ───
// Local computation only — no network calls, instant.
// Catches garbage inputs before they cost DNS queries or API credits.

/**
 * Risky TLD detection.
 * TLDs disproportionately associated with spam, phishing, and throwaway domains.
 * Sources: Spamhaus, SURBL, and industry reputation data.
 */

const RISKY_TLDS = new Set([
  // Free / near-free TLDs heavily abused
  'tk', 'ml', 'ga', 'cf', 'gq',
  // Cheap gTLDs with high abuse ratios
  'top', 'xyz', 'click', 'buzz', 'loan', 'work',
  'racing', 'download', 'stream', 'bid', 'win',
  'date', 'trade', 'review', 'party', 'science',
  'faith', 'accountant', 'cricket', 'gdn',
  // Frequently used for phishing
  'icu', 'cam', 'rest', 'surf', 'monster',
  'sbs', 'bond', 'cfd', 'cyou',
]);

export interface RiskyTldResult {
  is_risky_tld: boolean;
  tld: string;
}

export function checkRiskyTld(domain: string): RiskyTldResult {
  const parts = domain.toLowerCase().split('.');
  const tld = parts[parts.length - 1];
  return {
    is_risky_tld: RISKY_TLDS.has(tld),
    tld,
  };
}

/**
 * Shannon entropy of the domain name (excluding TLD).
 * High entropy (> 4.0) suggests randomly generated / DGA-style domains.
 * Normal domains (google, amazon, microsoft) score 2.5–3.5.
 * Random strings (x8k3mq9p2) score 4.0+.
 */

export interface EntropyResult {
  entropy: number;
  is_suspicious: boolean;
}

export function checkDomainEntropy(domain: string): EntropyResult {
  const parts = domain.toLowerCase().split('.');
  // Take everything except the TLD
  const name = parts.length > 1 ? parts.slice(0, -1).join('.') : parts[0];

  if (name.length === 0) {
    return { entropy: 0, is_suspicious: false };
  }

  const entropy = shannonEntropy(name);
  return {
    entropy: Math.round(entropy * 100) / 100, // 2 decimal places
    is_suspicious: entropy > 4.0 && name.length > 6,
  };
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  const len = s.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Spam trap / bounce address detection.
 * Extends role account detection with patterns that are specifically
 * non-deliverable or never monitored. Distinct from role accounts
 * (admin@, support@) which are functional but may be monitored.
 */

const SPAM_TRAP_PATTERNS = new Set([
  // Explicit non-delivery
  'noreply', 'no-reply', 'no_reply', 'no.reply',
  'donotreply', 'do-not-reply', 'do_not_reply', 'do.not.reply',
  // Mail system addresses
  'mailer-daemon', 'mailer_daemon', 'mailerdaemon',
  'mail-daemon', 'mail_daemon',
  'bounce', 'bounces', 'bounced',
  // Automated senders (not mailboxes)
  'notifications', 'notification',
  'alerts', 'alert',
  'automated', 'auto',
  'system', 'daemon',
  'cron', 'scheduler',
  // Anti-spam honeypots
  'spamtrap', 'spam-trap', 'spam_trap',
  'honeypot', 'honey-pot',
  'trap',
]);

export interface SpamTrapResult {
  is_spam_trap: boolean;
  pattern: string | null;
}

export function checkSpamTrap(localPart: string): SpamTrapResult {
  const lower = localPart.toLowerCase();

  // Exact match
  if (SPAM_TRAP_PATTERNS.has(lower)) {
    return { is_spam_trap: true, pattern: lower };
  }

  // Prefix match (e.g., noreply-xxx@, bounce+tag@)
  for (const pattern of SPAM_TRAP_PATTERNS) {
    if (lower.startsWith(pattern + '-') ||
        lower.startsWith(pattern + '+') ||
        lower.startsWith(pattern + '_') ||
        lower.startsWith(pattern + '.')) {
      return { is_spam_trap: true, pattern };
    }
  }

  return { is_spam_trap: false, pattern: null };
}
