// ─── MX fingerprinting ───
// Enhanced provider classification from MX records.
// Classifies into: enterprise, consumer, security-gateway, self-hosted, forwarding, unknown.
// Works with MX data already fetched — no additional network calls.

export interface MxFingerprintResult {
  /** High-level provider classification */
  mx_provider_class: 'enterprise' | 'consumer' | 'self-hosted' | 'forwarding' | 'unknown';
  /** Security gateway in front of the mail server, if detected */
  mx_security_gateway: string | null;
}

// Security gateways sit in front of the actual mail server
const SECURITY_GATEWAYS: Array<{ patterns: string[]; name: string }> = [
  { patterns: ['mimecast.com'], name: 'Mimecast' },
  { patterns: ['pphosted.com', 'proofpoint.com', 'ppe-hosted.com'], name: 'Proofpoint' },
  { patterns: ['barracudanetworks.com', 'barracuda.com', 'cuda-inc.com'], name: 'Barracuda' },
  { patterns: ['sophos.com', 'reflexion.net'], name: 'Sophos' },
  { patterns: ['mxlogic.net', 'mcafee.com'], name: 'McAfee' },
  { patterns: ['ess.barracuda.com'], name: 'Barracuda Essentials' },
  { patterns: ['iphmx.com'], name: 'Cisco IronPort' },
  { patterns: ['fireeyecloud.com', 'fireeye.com'], name: 'FireEye' },
  { patterns: ['trendmicro.com', 'trendmicro.eu'], name: 'Trend Micro' },
  { patterns: ['spamhero.com'], name: 'SpamHero' },
  { patterns: ['mailchannels.net'], name: 'MailChannels' },
];

// Enterprise mail providers
const ENTERPRISE_PATTERNS = [
  'google.com', 'googlemail.com', 'aspmx.l.google.com', // Google Workspace
  'mail.protection.outlook.com', // Microsoft 365
  'zoho.com', 'zoho.eu', 'zoho.in', // Zoho
  'protonmail.ch', 'protonmail.com', // Proton for Business
  'messagingengine.com', // Fastmail
  'migadu.com', // Migadu
  'kundenserver.de', 'ionos.com', // IONOS
  'secureserver.net', // GoDaddy
  'registrar-servers.com', // Namecheap
  'hover.com', // Hover
  'emailsrvr.com', 'rackspace.com', // Rackspace
  'pobox.com', // Pobox
  'runbox.com', // Runbox
  'tutanota.de', 'tutanota.com', // Tutanota
  'mailbox.org', // Mailbox.org
  'postmarkapp.com', // Postmark
];

// Consumer / free mail
const CONSUMER_PATTERNS = [
  'gmail-smtp-in.l.google.com', // Gmail consumer
  'outlook-com.olc.protection.outlook.com', 'hotmail.com', // Outlook.com
  'yahoodns.net', // Yahoo
  'mail.icloud.com', // iCloud
  'yandex.net', 'yandex.ru', // Yandex
  'mail.ru', // Mail.ru
  'qq.com', // QQ Mail
  'mx.naver.com', // Naver
  'gmx.net', 'gmx.com', // GMX
  'aol.com', // AOL
];

// Forwarding / relay services
const FORWARDING_PATTERNS = [
  'mx.cloudflare.net', // CF Email Routing
  'inbound-smtp.amazonaws.com', 'amazonaws.com', // SES
  'mx.sendgrid.net', // SendGrid
  'mailgun.org', // Mailgun
  'in.mailjet.com', // Mailjet
  'sparkpostmail.com', // SparkPost
  'forwardemail.net', // Forward Email
  'improvmx.com', // ImprovMX
  'simplelogin.co', // SimpleLogin
];

/**
 * Fingerprint MX records to classify the mail infrastructure.
 * Detects security gateways separately from the underlying provider class.
 */
export function fingerprintMx(mxRecords: Array<{ host: string }>): MxFingerprintResult {
  if (mxRecords.length === 0) {
    return { mx_provider_class: 'unknown', mx_security_gateway: null };
  }

  const hosts = mxRecords.map(r => r.host.toLowerCase().replace(/\.$/, ''));

  // Check for security gateway first
  let securityGateway: string | null = null;
  for (const gw of SECURITY_GATEWAYS) {
    if (hosts.some(h => gw.patterns.some(p => h === p || h.endsWith('.' + p)))) {
      securityGateway = gw.name;
      break;
    }
  }

  // If a security gateway is present, still classify but note the gateway
  // The underlying class is still useful even behind a gateway

  // Check consumer first (more specific patterns)
  for (const host of hosts) {
    if (CONSUMER_PATTERNS.some(p => host === p || host.endsWith('.' + p))) {
      return { mx_provider_class: 'consumer', mx_security_gateway: securityGateway };
    }
  }

  // Check enterprise
  for (const host of hosts) {
    if (ENTERPRISE_PATTERNS.some(p => host === p || host.endsWith('.' + p))) {
      return { mx_provider_class: 'enterprise', mx_security_gateway: securityGateway };
    }
  }

  // Check forwarding
  for (const host of hosts) {
    if (FORWARDING_PATTERNS.some(p => host === p || host.endsWith('.' + p))) {
      return { mx_provider_class: 'forwarding', mx_security_gateway: securityGateway };
    }
  }

  // If we found a security gateway but no known backend, likely enterprise
  if (securityGateway) {
    return { mx_provider_class: 'enterprise', mx_security_gateway: securityGateway };
  }

  // Self-hosted heuristic: MX contains the domain itself or common patterns
  // We can't check this without the domain, so return unknown
  // The caller can check if mx_host === domain or mail.{domain}
  return { mx_provider_class: 'unknown', mx_security_gateway: null };
}

/**
 * Check if MX records suggest self-hosted mail.
 * Separate function because it needs the domain to compare against.
 */
export function isSelfHostedMx(
  mxRecords: Array<{ host: string }>,
  domain: string,
): boolean {
  const d = domain.toLowerCase();
  for (const record of mxRecords) {
    const host = record.host.toLowerCase().replace(/\.$/, '');
    if (
      host === d ||
      host === `mail.${d}` ||
      host === `mx.${d}` ||
      host === `smtp.${d}` ||
      host === `mx1.${d}` ||
      host === `mx2.${d}` ||
      host === `mail1.${d}` ||
      host === `mail2.${d}`
    ) {
      return true;
    }
  }
  return false;
}
