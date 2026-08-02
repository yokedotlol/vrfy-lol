# vrfy.lol — Invariants

> Things that must ALWAYS be true. Adding or removing an invariant requires explicit human approval.

## Core Product

- [ ] **No SMTP probes.** vrfy.lol never connects to port 25. All analysis is DNS-based.
  - _Verify:_ `grep -r 'port.*25\|RCPT TO\|EHLO\|SMTP' src/` — must return zero results.

- [ ] **`action` field in every response.** Every validation response includes `action: "allow" | "verify" | "block"`.
  - _Verify:_ Check response type in `types.ts`.

- [ ] **Email addresses never in persistent storage.** Raw addresses never stored. Domain cache is domain-only (`domain:{domain}`); extended cache uses HMAC (`extended:{hmac(email)}`) so raw addresses are never stored.
  - _Verify:_ `grep -rn "CACHE.put" src/` — domain cache key is `domain:${domain}`, extended cache key is `extended:` + hex(HMAC). No raw `@` in keys.

- [ ] **No accounts, no API keys.** Rate limiting is IP-based only.
  - _Verify:_ `grep -r 'api.key\|apikey\|api_key\|authorization.*bearer' src/` — should only find probe auth, never user-facing auth.

## Privacy

- [ ] **Privacy relays are NOT disposable.** Apple Hide My Email, SimpleLogin, etc. are classified separately from disposable services.
  - _Verify:_ Privacy relay check must set `privacy_relay: true` without setting `disposable: true`.

- [ ] **POST endpoint keeps emails out of URLs.** `POST /` accepts email in request body, never in URL path.
  - _Verify:_ POST handler reads from `request.json()`, not URL params.

## Data Integrity

- [ ] **Only CC0/MIT-compatible data bundled.** No unlicensed datasets in the repo.
  - _Verify:_ Check `THIRD_PARTY_LICENSES.md` against bundled data files.

- [ ] **Typo suggestions verified against MX.** Don't suggest corrections to domains that can't receive email.
  - _Verify:_ Typo suggestion code checks MX before returning suggestion.

## Rate Limiting

- [ ] **10 requests/hour + 50/day per IP.** Durable Object sliding window.
  - _Verify:_ Check `HOURLY_LIMIT` and `DAILY_LIMIT` constants in rate limiter.

- [ ] **Batch counts as 1 request.** `POST /batch` (up to 20 emails) counts as a single rate-limited request.
  - _Verify:_ Rate limit check happens once per request, not per email in batch.

- [ ] **Cache hits still count against rate limits (vrfy exception).** Unlike other .lol tools, vrfy does NOT skip rate limits on cache hits — cached results would be free rides on another user's PoW.
  - _Verify:_ In `src/index.ts`, `checkRateLimit` happens BEFORE `validateEmail` (which does cache lookup).

## Build & Deploy

- [ ] **TypeScript strict mode.** No `any`, no `@ts-ignore`.
  - _Verify:_ `tsconfig.json` has `"strict": true`.

- [ ] **Pre-commit hooks active.**
  - _Verify:_ `git config core.hooksPath`.
