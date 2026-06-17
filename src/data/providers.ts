// ─── Provider identification from MX records ───
// Maps MX host patterns to email providers with behavior hints.

import type { ProviderInfo } from '../types';

interface ProviderPattern {
  /** MX host suffix pattern (matched against end of hostname) */
  patterns: string[];
  info: ProviderInfo;
}

const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    patterns: ['aspmx.l.google.com', 'googlemail.com', 'google.com'],
    info: {
      name: 'Google Workspace',
      is_free: false,
      catch_all_default: true,
      smtp_verification: 'unreliable',
      note: 'Google accepts all addresses via SMTP. Send a verification email.',
    },
  },
  {
    patterns: ['gmail-smtp-in.l.google.com'],
    info: {
      name: 'Gmail',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unreliable',
      note: 'Gmail consumer accounts. Google SMTP responses are unreliable for verification.',
    },
  },
  {
    patterns: ['mail.protection.outlook.com'],
    info: {
      name: 'Microsoft 365',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'Microsoft 365. SMTP verification works but is rate-limited.',
    },
  },
  {
    patterns: ['outlook-com.olc.protection.outlook.com', 'hotmail.com'],
    info: {
      name: 'Outlook.com',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'Microsoft consumer email (Outlook.com, Hotmail, Live).',
    },
  },
  {
    patterns: ['yahoodns.net'],
    info: {
      name: 'Yahoo',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'blocked',
      note: 'Yahoo blocks SMTP verification outright. Send a verification email.',
    },
  },
  {
    patterns: ['protonmail.ch', 'protonmail.com'],
    info: {
      name: 'Proton Mail',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'blocked',
      note: 'Proton Mail does not allow SMTP verification. Send a verification email.',
    },
  },
  {
    patterns: ['zoho.com', 'zoho.eu', 'zoho.in'],
    info: {
      name: 'Zoho Mail',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'Zoho Mail. SMTP verification generally works.',
    },
  },
  {
    patterns: ['mail.icloud.com'],
    info: {
      name: 'Apple iCloud',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unreliable',
      note: 'Apple iCloud Mail.',
    },
  },
  {
    patterns: ['messagingengine.com'],
    info: {
      name: 'Fastmail',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'Fastmail. SMTP verification works for standard accounts.',
    },
  },
  {
    patterns: ['inbound-smtp.amazonaws.com', 'amazonaws.com'],
    info: {
      name: 'Amazon SES',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Amazon SES. Behavior varies by configuration.',
    },
  },
  {
    patterns: ['mimecast.com'],
    info: {
      name: 'Mimecast',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Mimecast email security gateway. Underlying provider may differ.',
    },
  },
  {
    patterns: ['barracudanetworks.com', 'barracuda.com'],
    info: {
      name: 'Barracuda',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Barracuda email security gateway. Underlying provider may differ.',
    },
  },
  {
    patterns: ['pphosted.com', 'proofpoint.com'],
    info: {
      name: 'Proofpoint',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Proofpoint email security gateway. Underlying provider may differ.',
    },
  },
  {
    patterns: ['mx.cloudflare.net'],
    info: {
      name: 'Cloudflare Email Routing',
      is_free: true,
      catch_all_default: true,
      smtp_verification: 'unknown',
      note: 'Cloudflare Email Routing. Forwards to another provider.',
    },
  },
  {
    patterns: ['mailgun.org'],
    info: {
      name: 'Mailgun',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Mailgun transactional email service.',
    },
  },
  {
    patterns: ['mx.sendgrid.net'],
    info: {
      name: 'SendGrid',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'SendGrid (Twilio) email service.',
    },
  },
  {
    patterns: ['migadu.com'],
    info: {
      name: 'Migadu',
      is_free: false,
      catch_all_default: true,
      smtp_verification: 'reliable',
      note: 'Migadu email hosting. Catch-all enabled by default.',
    },
  },
  {
    patterns: ['hover.com'],
    info: {
      name: 'Hover',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Hover email hosting.',
    },
  },
  {
    patterns: ['kundenserver.de', 'ionos.com'],
    info: {
      name: 'IONOS',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'IONOS (1&1) email hosting.',
    },
  },
  {
    patterns: ['secureserver.net', 'mailstore1.secureserver.net'],
    info: {
      name: 'GoDaddy',
      is_free: false,
      catch_all_default: false,
      smtp_verification: 'reliable',
      note: 'GoDaddy email hosting.',
    },
  },
  {
    patterns: ['yandex.net', 'yandex.ru'],
    info: {
      name: 'Yandex',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Yandex Mail.',
    },
  },
  {
    patterns: ['mail.ru'],
    info: {
      name: 'Mail.ru',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Mail.ru (VK).',
    },
  },
  {
    patterns: ['qq.com'],
    info: {
      name: 'QQ Mail',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'QQ Mail (Tencent).',
    },
  },
  {
    patterns: ['mx.naver.com'],
    info: {
      name: 'Naver',
      is_free: true,
      catch_all_default: false,
      smtp_verification: 'unknown',
      note: 'Naver Mail (South Korea).',
    },
  },
];

/**
 * Identify email provider from MX hostnames.
 * Matches against known MX suffix patterns.
 * Returns the first match (patterns are ordered by specificity).
 */
export function identifyProvider(mxHosts: string[]): ProviderInfo | null {
  for (const mx of mxHosts) {
    const lower = mx.toLowerCase().replace(/\.$/, ''); // strip trailing dot
    for (const provider of PROVIDER_PATTERNS) {
      if (provider.patterns.some(p => lower === p || lower.endsWith('.' + p))) {
        return provider.info;
      }
    }
  }
  return null;
}

/**
 * Check if the provider is known to be a free email service based on MX.
 * This supplements the domain-based free provider check.
 */
export function isFreeMxProvider(mxHosts: string[]): boolean {
  const provider = identifyProvider(mxHosts);
  return provider?.is_free ?? false;
}
