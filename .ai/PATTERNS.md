# vrfy.lol — Key Patterns & Anti-Patterns

> Operational coding guide. Follow these when working in the codebase.

## Validation Pipeline (`validate.ts`)

The entry point for all email validation. Flow:

1. Parse email → extract domain + local part
2. Domain cache check (KV, domain-only key)
3. If miss: parallel DNS resolution (MX, SPF, DMARC, DNSSEC, etc.)
4. Yoke service binding for richer email auth signals (if available, else inline)
5. Local-part checks: role account, typo, subaddress, spam trap, pattern
6. Extended validation via service binding (if available)
7. Action determination (`allow`/`verify`/`block`)
8. Confidence classification (`valid`/`likely_valid`/`risky`/`invalid`/`unknown`)

## Validator Pattern (`validators/*.ts`)

Each validator is a self-contained module that examines one aspect of the email. Pattern:

```typescript
export function checkSomething(input: SomeInput): SomeResult {
  // Pure function — no side effects, no network calls
  // Returns structured result with findings
}
```

DNS-based validators may be async (DoH lookups). All validators fail open — an error in one check doesn't block the validation.

## Data Files (`data/*.ts`)

Static datasets are TypeScript files exporting `Set<string>` or `Map<string, T>`:
- `disposable.ts` — 141K+ disposable domains (CC0/MIT, built by `scripts/update-disposable-list.ts`)
- `free-providers.ts` — known free email providers
- `privacy-relays.ts` — relay services (Apple, SimpleLogin, etc.)
- `providers.ts` — provider MX patterns + behavior hints
- `role-accounts.ts` — role account local parts
- `typos.ts` — domain typo corrections

To update the disposable list: `bun run update-disposable`

## Service Binding Pattern (`services/domain-intel.ts`)

The first .lol family service binding. Pattern for calling sibling services:

```typescript
// Check if binding exists
if (!env.YOKE) return fallbackResult();

// Call via service binding (in-process, zero network cost)
const resp = await env.YOKE.fetch(new Request('https://internal/api/...'));

// Parse and map to vrfy's types
// Fall back to inline checks on any error
```

Key principle: **bindings are always optional**. Every binding call has a `try/catch` with a meaningful fallback. Self-hosters can remove any binding and the tool still works.

## Rate Limiting (`rate-limiter.ts`)

Durable Object-based, two windows:
- 10 requests/hour (sliding window)
- 50 requests/day (sliding window)

Batch requests (`POST /batch`, up to 20 emails) count as 1 request. Cache hits bypass the rate limiter entirely.

When rate limited, clients can solve a PoW challenge to bypass. The PoW system is stateless (HMAC-based, no nonce storage).

## Caching Strategy

Two cache layers, both in the same KV namespace:

| Layer | Key | TTL | Data |
|-------|-----|-----|------|
| Domain | `{domain}` | 7 days | DNS, MX, security, provider |
| Extended | HMAC-keyed email hash | 30 days (smart) | Existence signals |

Domain cache keys never contain email addresses. Extended cache uses HMAC to pseudonymize — the raw email is processed in memory and discarded.

Smart TTL for extended cache: high-rep emails with many platform signals get 30 days. Low/no data gets 3 days (re-check sooner).

## SPA Rendering (`spa.ts`)

Server-side HTML generation — no client-side framework. The `renderPage()` function returns complete HTML with:
- CSP with nonce (no inline scripts)
- Embedded CSS (family design tokens)
- JS for interactivity (API calls, results rendering)

Static page paths are in the `SPA_PATHS` set in `index.ts`.

## Anti-Patterns — Don't Do These

- **No email addresses in KV keys.** Domain-only for domain cache. HMAC for extended cache.
- **No `as any`.** TypeScript strict mode, no escape hatches.
- **No SMTP connections.** This is the product identity. DNS-only analysis.
- **No bundling unlicensed data.** CC0/MIT datasets only. FakeFilter is API-consumption only.
- **No secrets in code or wrangler.toml.** Use `wrangler secret put`.
- **No bare `fetch()` without timeout.** Always use AbortSignal.timeout().
- **No hardcoded service binding URLs.** Check if binding exists, fall back gracefully.
