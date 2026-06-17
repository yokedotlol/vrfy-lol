// ─── Standardized error responses ───
// Every error follows the same shape:
//   { error: string, message: string, docs?: string, pow?: PowChallenge }

import type { PowChallenge } from './pow';

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_email'
  | 'rate_limited'
  | 'pow_invalid'
  | 'internal_error'
  | 'service_unavailable';

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  docs?: string;
  pow?: PowChallenge;
}

const DOCS_BASE = 'https://vrfy.lol/docs';

/**
 * Build an error response object with the standard shape.
 */
export function buildError(
  code: ErrorCode,
  message: string,
  pow?: PowChallenge,
): ErrorResponse {
  const resp: ErrorResponse = { error: code, message };

  if (code === 'rate_limited' || code === 'pow_invalid') {
    resp.docs = `${DOCS_BASE}/pow`;
  }

  if (pow) {
    resp.pow = pow;
  }

  return resp;
}

/**
 * Get the HTTP status code for an error code.
 */
export function errorStatus(code: ErrorCode): number {
  switch (code) {
    case 'invalid_request': return 400;
    case 'invalid_email': return 422;
    case 'rate_limited': return 429;
    case 'pow_invalid': return 429;
    case 'internal_error': return 500;
    case 'service_unavailable': return 503;
  }
}

/** Pre-built error messages */
export const ERRORS = {
  missingEmail: () => buildError(
    'invalid_request',
    'Missing or invalid "email" field in request body.',
  ),
  invalidEmail: (reason: string) => buildError(
    'invalid_email',
    `Invalid email address: ${reason}`,
  ),
  missingEmails: () => buildError(
    'invalid_request',
    'Missing or invalid "emails" array in request body.',
  ),
  emptyEmails: () => buildError(
    'invalid_request',
    'Empty emails array.',
  ),
  batchTooLarge: (max: number, received: number) => buildError(
    'invalid_request',
    `Batch size ${received} exceeds maximum of ${max} emails.`,
  ),
  rateLimited: (pow: PowChallenge) => buildError(
    'rate_limited',
    'Rate limit exceeded. Include a proof-of-work solution to continue. '
    + 'Install our SDK (npm install @vrfy/sdk) for automatic solving, '
    + 'or see https://vrfy.lol/docs/pow for the protocol.',
    pow,
  ),
  powInvalid: (pow: PowChallenge) => buildError(
    'pow_invalid',
    'Proof-of-work solution is invalid or expired. Request a new challenge and try again.',
    pow,
  ),
  internal: () => buildError(
    'internal_error',
    'An unexpected error occurred.',
  ),
  unavailable: () => buildError(
    'service_unavailable',
    'Service temporarily unavailable. Try again shortly.',
  ),
} as const;
