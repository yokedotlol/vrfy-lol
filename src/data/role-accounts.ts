// ─── Role account local parts ───
// Group inboxes and functional addresses, not individual humans.
// Per RFC 2142 and industry convention.

// Tier 1 — RFC 2142 required/standard
const RFC_2142_ROLES = [
  'postmaster', 'abuse', 'hostmaster', 'webmaster',
  'noc', 'security', 'info', 'marketing', 'sales', 'support',
] as const;

// Tier 2 — widely used functional addresses
const COMMON_ROLES = [
  'admin', 'administrator',
  'billing',
  'contact', 'contacts',
  'help', 'helpdesk',
  'hr', 'human-resources', 'humanresources',
  'jobs', 'careers', 'recruiting', 'recruitment',
  'legal', 'compliance',
  'media', 'press',
  'office', 'reception',
  'privacy',
  'feedback',
  'team',
  'operations', 'ops',
  'finance', 'accounting',
  'dev', 'devops', 'engineering',
  'it', 'tech', 'technical',
  'service', 'services',
  'orders',
  'returns',
  'newsletter', 'subscribe', 'unsubscribe',
  'mailer-daemon', 'mail-daemon',
  'root',
  'ftp',
  'www',
  'dns',
  'registrar',
  'whois',
] as const;

// No-reply addresses — functional, never monitored by a human
const NOREPLY_VARIANTS = [
  'noreply', 'no-reply', 'no_reply',
  'donotreply', 'do-not-reply', 'do_not_reply',
  'mailer', 'notifications', 'notification',
  'alerts', 'alert',
  'bounce', 'bounces',
  'auto', 'automated',
  'system', 'daemon',
] as const;

const ALL_ROLE_ACCOUNTS = new Set<string>([
  ...RFC_2142_ROLES,
  ...COMMON_ROLES,
  ...NOREPLY_VARIANTS,
]);

/**
 * Check if a local part is a known role/functional account.
 * Note: postmaster@domain is RFC-required — it's a role account
 * but not necessarily a risk signal.
 */
export function isRoleAccount(localPart: string): boolean {
  return ALL_ROLE_ACCOUNTS.has(localPart.toLowerCase());
}
