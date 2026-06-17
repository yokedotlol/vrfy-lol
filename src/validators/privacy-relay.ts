// ─── Privacy relay classification ───
// Privacy relays are NOT disposable — they forward to real inboxes.
// Classify separately so developers don't block Apple iCloud+ subscribers, etc.

import type { PrivacyRelayResult } from '../types';
import { getPrivacyRelayService } from '../data/privacy-relays';

/**
 * Check if an email address is using a privacy relay service.
 * Returns the specific service name if matched.
 */
export function checkPrivacyRelay(domain: string): PrivacyRelayResult {
  const service = getPrivacyRelayService(domain);

  return {
    is_privacy_relay: service !== null,
    service,
  };
}
