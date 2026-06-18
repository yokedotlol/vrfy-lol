// ─── Proof of Work challenge-response system ───
// Anti-abuse without API keys. Based on Hashcash principles.
//
// Protocol:
//   1. Client exceeds free threshold → gets 429 with challenge
//   2. Client finds nonce where SHA-256(challenge + ":" + nonce) has N leading zero bits
//   3. Client resubmits with {pow: {challenge, nonce}}
//   4. Server verifies in microseconds, processes request
//
// Challenges are IP-bound and deterministic:
//   challenge = HMAC-SHA256(POW_SECRET, ip + ":" + floor(now/300))
// Server never stores challenges — recomputes on verification.
// Accepts current AND previous time bucket for clock-edge tolerance.

/** Challenge object returned to clients */
export interface PowChallenge {
  algorithm: 'sha256';
  challenge: string;
  difficulty: number;
  expires: number;
}

/** Solution submitted by clients */
export interface PowSolution {
  challenge: string;
  nonce: string;
}

const DEFAULT_DIFFICULTY = 20;
const BUCKET_SECONDS = 300; // 5-minute buckets

/**
 * Generate a PoW challenge for the given IP.
 * Deterministic: same IP + same 5-minute window = same challenge.
 */
export async function generateChallenge(
  ip: string,
  secret: string,
  difficulty: number = DEFAULT_DIFFICULTY,
): Promise<PowChallenge> {
  const bucket = currentBucket();
  const challenge = await computeChallenge(ip, secret, bucket);
  const expires = (bucket + 1) * BUCKET_SECONDS;

  return {
    algorithm: 'sha256',
    challenge,
    difficulty,
    expires,
  };
}

/**
 * Verify a PoW solution.
 * Recomputes challenge for current AND previous time bucket.
 * Returns true if the solution is valid (nonce freshness checked separately by DO).
 */
export async function verifyPow(
  pow: PowSolution,
  ip: string,
  secret: string,
  difficulty: number = DEFAULT_DIFFICULTY,
): Promise<boolean> {
  const bucket = currentBucket();

  // Accept current or previous bucket (clock-edge tolerance)
  const [currentChallenge, previousChallenge] = await Promise.all([
    computeChallenge(ip, secret, bucket),
    computeChallenge(ip, secret, bucket - 1),
  ]);

  // Verify the submitted challenge matches one of the expected values
  if (pow.challenge !== currentChallenge && pow.challenge !== previousChallenge) {
    return false;
  }

  // Verify hash meets difficulty
  const input = `${pow.challenge}:${pow.nonce}`;
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  const bits = countLeadingZeroBits(new Uint8Array(hashBuffer));

  return bits >= difficulty;
}

// ─── Internal helpers ───

function currentBucket(): number {
  return Math.floor(Date.now() / 1000 / BUCKET_SECONDS);
}

async function computeChallenge(
  ip: string,
  secret: string,
  bucket: number,
): Promise<string> {
  const data = `${ip}:${bucket}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  );
  return hexEncode(new Uint8Array(sig));
}

function countLeadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // Count leading zeros in this byte
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
