/**
 * Tests for the vrfy Node SDK.
 *
 * All HTTP calls are mocked — no live API traffic.
 * Run: cd clients/node && bun test
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { createHash } from "node:crypto";
import { countLeadingZeroBits, solvePoW, validate, validateBatch } from "./index.js";

// ─── PoW Solver ──────────────────────────────────────────────────────────────

describe("countLeadingZeroBits", () => {
  // Matches Go test vectors exactly
  const cases: [Uint8Array, number][] = [
    [new Uint8Array([0x00, 0x00, 0x01]), 23],
    [new Uint8Array([0x00, 0x80]), 8],
    [new Uint8Array([0x80]), 0],
    [new Uint8Array([0x40]), 1],
    [new Uint8Array([0x20]), 2],
    [new Uint8Array([0x01]), 7],
    [new Uint8Array([0x00, 0x00, 0x00]), 24],
  ];

  for (const [input, expected] of cases) {
    test(`${Buffer.from(input).toString("hex")} → ${expected}`, () => {
      expect(countLeadingZeroBits(Buffer.from(input))).toBe(expected);
    });
  }
});

describe("solvePoW", () => {
  const CHALLENGE = "deadbeef01234567890abcdef01234567890abcdef01234567890abcdef012345";
  const DIFFICULTY = 8;

  test("produces valid nonce", () => {
    const nonce = solvePoW(CHALLENGE, DIFFICULTY);
    expect(typeof nonce).toBe("number");
    expect(nonce).toBeGreaterThanOrEqual(0);

    // Verify the solution
    const hash = createHash("sha256")
      .update(`${CHALLENGE}:${nonce}`)
      .digest();
    expect(countLeadingZeroBits(hash)).toBeGreaterThanOrEqual(DIFFICULTY);
  });
});

// ─── Mock helpers ────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  email: "test@example.com",
  action: "allow",
  confidence: "valid",
  validation: { syntax_valid: true, mx_found: true },
  _meta: { signals: 42, cached: false, query_ms: 123, version: "1.0.0" },
};

const MOCK_BATCH_RESULT = {
  results: [
    { ...MOCK_RESULT, email: "alice@gmail.com" },
    { ...MOCK_RESULT, email: "bob@company.com" },
  ],
  batch_ms: 456,
  domains_queried: 2,
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(...responses: Array<{ status: number; body: unknown }>): void {
  let callIndex = 0;
  globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
    const resp = responses[callIndex++];
    if (!resp) throw new Error("Unexpected fetch call");
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

// ─── validate() ──────────────────────────────────────────────────────────────

describe("validate", () => {
  test("success", async () => {
    mockFetch({ status: 200, body: MOCK_RESULT });

    const result = await validate("test@example.com", { baseURL: "https://vrfy.lol" });
    expect(result.email).toBe("test@example.com");
    expect(result.action).toBe("allow");
  });

  test("pow retry", async () => {
    const challenge = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const powBody = {
      error: "rate_limited",
      message: "Too many requests",
      pow: { algorithm: "sha-256", challenge, difficulty: 8, expires: 9999999999 },
    };

    // Capture the retry body
    let retryBody: Record<string, unknown> | null = null;
    let callIndex = 0;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(powBody), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      retryBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(MOCK_RESULT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await validate("test@example.com", { baseURL: "https://vrfy.lol" });
    expect(result.action).toBe("allow");
    expect(callIndex).toBe(2);

    // Verify PoW solution was included and is valid
    expect(retryBody).not.toBeNull();
    const pow = (retryBody as Record<string, unknown>).pow as { challenge: string; nonce: string };
    expect(pow.challenge).toBe(challenge);
    const hash = createHash("sha256").update(`${challenge}:${pow.nonce}`).digest();
    expect(countLeadingZeroBits(hash)).toBeGreaterThanOrEqual(8);
  });

  test("error throws", async () => {
    mockFetch({ status: 400, body: { error: "invalid_email", message: "Invalid email syntax" } });

    expect(validate("not-an-email", { baseURL: "https://vrfy.lol" })).rejects.toThrow("Invalid email syntax");
  });
});

// ─── validateBatch() ─────────────────────────────────────────────────────────

describe("validateBatch", () => {
  test("success", async () => {
    mockFetch({ status: 200, body: MOCK_BATCH_RESULT });

    const result = await validateBatch(["alice@gmail.com", "bob@company.com"], {
      baseURL: "https://vrfy.lol",
    });
    expect(result.results.length).toBe(2);
    expect(result.results[0].email).toBe("alice@gmail.com");
    expect(result.domains_queried).toBe(2);
  });

  test("too many emails", () => {
    const emails = Array.from({ length: 21 }, (_, i) => `user${i}@example.com`);
    expect(() => validateBatch(emails)).toThrow("exceeds maximum of 20");
  });

  test("empty list", () => {
    expect(() => validateBatch([])).toThrow("empty email list");
  });
});
