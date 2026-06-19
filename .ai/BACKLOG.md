# vrfy.lol — Backlog

> Known remaining work, tech debt, and future plans. Ordered by priority.

## Phase 2 — Fly Probe + DNSBL

- [ ] **Fly.io probe service** (`vrfy-probe`) for DNSBL queries requiring direct DNS resolution (not DoH)
- [ ] **Spamhaus DBL integration** — deferred pending usage data. Need usage dashboard metrics to justify ~$250/yr spend
- [ ] **DNSBL composite signal** — combine multiple DNSBL sources for domain reputation

## Launch

- [ ] **Flip repo to public** — currently private, needs to go public at launch
- [ ] **Staggered launch** — soft launch first, then Show HN (per DECISIONS.md)

## Known Tech Debt

- [ ] **Rate limit headers incomplete** — `rateLimitHeaders()` is a placeholder in some paths; should return actual X-RateLimit-* headers from DO response
- [ ] **No test suite** — `bun test` is in package.json scripts but no test files exist yet
- [ ] **Package version mismatch** — `package.json` says `0.1.0`, git tag is `v1.0.0`

## Future Signals

- [ ] **DANE TLSA validation** — DNSSEC-based cert pinning for MX hosts (requires MX lookup + TLSA query)
- [ ] **Sender Score / Talos reputation** — additional domain reputation sources
- [ ] **Catch-all vs reject verification** — heuristic analysis of domain's catch-all behavior

## Infrastructure

- [ ] **Usage dashboard** — track API call volume, error rates, DNSBL query projections (needed before Spamhaus decision)
- [ ] **CI pipeline** — GitHub Actions for typecheck + deploy (exists for CLI release, not for Worker yet)
