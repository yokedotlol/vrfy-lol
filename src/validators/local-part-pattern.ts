// ─── Local-part pattern analysis ───
// Classify the structure of an email local part to infer likely account type.
// Purely structural — no external lookups.

export interface LocalPartPattern {
  /** Primary pattern classification */
  classification: LocalPartClass;
  /** Whether the local part looks auto-generated / random */
  is_random: boolean;
  /** Number of numeric digits present */
  digit_count: number;
  /** Total length of the local part */
  length: number;
}

export type LocalPartClass =
  | 'first.last'      // john.smith
  | 'first_last'      // john_smith
  | 'firstlast'       // johnsmith
  | 'flast'           // jsmith
  | 'firstl'          // johns
  | 'initials'        // js, jds
  | 'name_number'     // john.smith42
  | 'word'            // contact, hello (short single word)
  | 'random'          // x7k2m9q (high entropy / no pattern)
  | 'numeric'         // 12345678
  | 'custom'          // doesn't match common patterns
  ;

// Entropy threshold: ratio of unique chars to length.
// Random strings tend to have high char diversity relative to length.
const ENTROPY_THRESHOLD = 0.85;

// Common real-word prefixes/names that shouldn't be flagged as random
// (We don't need an exhaustive dictionary — just enough to avoid false positives
// on short common names)
const MIN_RANDOM_LENGTH = 8;

/**
 * Classify an email local part by its structural pattern.
 */
export function classifyLocalPart(localPart: string): LocalPartPattern {
  // Strip any +tag subaddress before classifying
  const base = localPart.includes('+')
    ? localPart.substring(0, localPart.indexOf('+'))
    : localPart;

  const lower = base.toLowerCase();
  const length = lower.length;
  const digits = (lower.match(/\d/g) ?? []).length;
  const alpha = (lower.match(/[a-z]/g) ?? []).length;

  // Pure numeric
  if (/^\d+$/.test(lower)) {
    return { classification: 'numeric', is_random: length >= 6, digit_count: digits, length };
  }

  // first.last or first.last.N
  if (/^[a-z]+\.[a-z]+$/.test(lower)) {
    return { classification: 'first.last', is_random: false, digit_count: 0, length };
  }
  if (/^[a-z]+\.[a-z]+\d{1,4}$/.test(lower)) {
    return { classification: 'name_number', is_random: false, digit_count: digits, length };
  }

  // first_last
  if (/^[a-z]+_[a-z]+$/.test(lower)) {
    return { classification: 'first_last', is_random: false, digit_count: 0, length };
  }

  // flast (single initial + name, 2-15 chars total, all alpha)
  if (/^[a-z][a-z]{2,14}$/.test(lower) && digits === 0) {
    // Try to distinguish flast from firstlast from single word
    // flast: one letter + longer name segment (jsmith, bwilson)
    // firstlast: two name-length segments run together (johnsmith)
    // word: a short dictionary-like word (hello, info)
    if (length <= 4) {
      return { classification: 'initials', is_random: false, digit_count: 0, length };
    }
    if (length <= 7) {
      return { classification: 'word', is_random: false, digit_count: 0, length };
    }
    // 8+ all-alpha chars with no separator could be firstlast or flast
    // Without a name dictionary we can't distinguish, so call it firstlast
    return { classification: 'firstlast', is_random: false, digit_count: 0, length };
  }

  // Check for random/auto-generated strings
  // High digit ratio + sufficient length = likely random
  const digitRatio = digits / length;
  const isLongEnough = length >= MIN_RANDOM_LENGTH;
  const hasMixedCharsAndDigits = digits >= 2 && alpha >= 2 && digitRatio > 0.25;

  // Character diversity check (normalized unique chars)
  const uniqueChars = new Set(lower).size;
  const diversity = uniqueChars / Math.min(length, 20); // cap denominator

  if (isLongEnough && hasMixedCharsAndDigits && diversity >= ENTROPY_THRESHOLD) {
    return { classification: 'random', is_random: true, digit_count: digits, length };
  }

  // Alphanumeric but not matching specific patterns
  if (isLongEnough && hasMixedCharsAndDigits) {
    // Even with lower diversity, heavily mixed strings are suspect
    return { classification: 'random', is_random: true, digit_count: digits, length };
  }

  // Short initials (2-3 chars, all alpha)
  if (/^[a-z]{2,3}$/.test(lower)) {
    return { classification: 'initials', is_random: false, digit_count: 0, length };
  }

  // Name + number (john42, smith99)
  if (/^[a-z]+\d{1,4}$/.test(lower) && alpha >= 3) {
    return { classification: 'name_number', is_random: false, digit_count: digits, length };
  }

  // firstl pattern (name + single trailing initial)
  if (/^[a-z]{3,}\.[a-z]$/.test(lower)) {
    return { classification: 'firstl', is_random: false, digit_count: 0, length };
  }

  // f.last pattern (initial.name)
  if (/^[a-z]\.[a-z]{2,}$/.test(lower)) {
    return { classification: 'flast', is_random: false, digit_count: 0, length };
  }

  // Fallback
  return {
    classification: 'custom',
    is_random: false,
    digit_count: digits,
    length,
  };
}
