// ─── Typo detection and suggestion ───
// Two-stage approach:
// 1. Curated map of known domain misspellings (fast path)
// 2. Levenshtein distance against top providers (fallback)

import type { TypoResult } from '../types';
import { TYPO_MAP, TOP_PROVIDER_DOMAINS } from '../data/typos';

const MAX_LEVENSHTEIN_DISTANCE = 2;

/**
 * Check if the domain part of an email has a likely typo.
 * Returns a suggestion if found.
 *
 * Note: The caller should verify MX exists on the suggested domain
 * before presenting the suggestion to users.
 */
export function detectTypo(domain: string): TypoResult {
  const lower = domain.toLowerCase();

  // Stage 1: curated map (fast, exact match)
  const mapped = TYPO_MAP[lower];
  if (mapped) {
    return {
      has_typo: true,
      suggestion: null, // will be assembled with local part by caller
      original_domain: lower,
      suggested_domain: mapped,
      distance: levenshteinDistance(lower, mapped),
    };
  }

  // Stage 2: Levenshtein against top providers
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const provider of TOP_PROVIDER_DOMAINS) {
    // Skip if the domain IS a known provider
    if (lower === provider) {
      return noTypo(lower);
    }

    const dist = levenshteinDistance(lower, provider);
    if (dist <= MAX_LEVENSHTEIN_DISTANCE && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = provider;
    }
  }

  if (bestMatch) {
    return {
      has_typo: true,
      suggestion: null,
      original_domain: lower,
      suggested_domain: bestMatch,
      distance: bestDistance,
    };
  }

  return noTypo(lower);
}

/**
 * Levenshtein distance between two strings.
 * Classic DP implementation, O(m*n) time and O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Single row, reused
  let prev = new Array<number>(aLen + 1);
  let curr = new Array<number>(aLen + 1);

  // Initialize first row
  for (let i = 0; i <= aLen; i++) {
    prev[i] = i;
  }

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,      // insertion
        prev[i] + 1,           // deletion
        prev[i - 1] + cost,    // substitution
      );
    }

    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

function noTypo(domain: string): TypoResult {
  return {
    has_typo: false,
    suggestion: null,
    original_domain: domain,
    suggested_domain: null,
    distance: null,
  };
}
