// ─── Role account detection ───
// Identifies functional/group addresses vs individual humans.

import { isRoleAccount as checkRole } from '../data/role-accounts';

/**
 * Check if the local part of an email is a known role/functional account.
 */
export function isRoleAccount(localPart: string): boolean {
  return checkRole(localPart);
}
