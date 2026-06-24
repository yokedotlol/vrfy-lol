# vrfy.lol — Backlog

> Known remaining work, tech debt, and future plans. Ordered by priority.

## Phase 2 — Fly Probe + DNSBL

- [ ] **Fly.io probe service** (`vrfy-probe`) for DNSBL queries requiring direct DNS resolution (not DoH)
- [ ] **Spamhaus DBL integration** — deferred pending usage data. Need usage dashboard metrics to justify ~$250/yr spend
- [ ] **DNSBL composite signal** — combine multiple DNSBL sources for domain reputation

## Launch

- [x] **Flip repo to public** — repo is now public
- [ ] **Staggered launch** — soft launch first, then Show HN (per DECISIONS.md)

## Known Tech Debt

- [x] **Rate limit headers incomplete** — `rateLimitHeaders()` is a placeholder in some paths; should return actual X-RateLimit-* headers from DO response
- [x] **No test suite** — tests exist and pass (`bun test`)
- [ ] **Package version mismatch** — `package.json` says `0.1.0`, git tag is `v1.0.0` (intentional: Worker package is private)

## Future Signals

- [ ] **DANE TLSA validation** — DNSSEC-based cert pinning for MX hosts (requires MX lookup + TLSA query)
- [ ] **Sender Score / Talos reputation** — additional domain reputation sources
- [ ] **Catch-all vs reject verification** — heuristic analysis of domain's catch-all behavior

## Infrastructure

- [ ] **Usage dashboard** — track API call volume, error rates, DNSBL query projections (needed before Spamhaus decision)
- [x] **CI pipeline** — GitHub Actions workflow exists (`.github/workflows/deploy.yml`) for typecheck + deploy
