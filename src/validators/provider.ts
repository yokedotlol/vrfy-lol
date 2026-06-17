// ─── Provider identification ───
// Detect the email service provider from MX records.

import type { ProviderInfo } from '../types';
import { identifyProvider } from '../data/providers';

/**
 * Identify the email provider from MX hostnames.
 * Returns provider info with behavior hints if recognized.
 */
export function detectProvider(mxHosts: string[]): ProviderInfo | null {
  return identifyProvider(mxHosts);
}
