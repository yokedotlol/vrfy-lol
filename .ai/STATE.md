# vrfy.lol — Current State

> Volatile snapshot of the project. Updated after significant sessions.

**Last updated:** 2026-06-18

## Versions

| Component | Version | Source |
|-----------|---------|--------|
| Worker (service) | 1.0.0 | `src/index.ts` (`VERSION` const) |
| Package | 0.1.0 | `package.json` |
| Git tag | v1.0.0 | `git tag` |

## Architecture

| Layer | Technology |
|-------|-----------|
| Worker | Cloudflare Workers (TypeScript, zero-framework) |
| Cache | KV `CACHE` — domain-level result cache (7-day TTL) |
| Extended Cache | KV `CACHE` — HMAC-keyed email-level extended results (30-day TTL) |
| Rate Limiting | Durable Object `RateLimiterDO` — per-IP (10/hr + 50/day) |
| PoW | Hashcash SHA-256 — stateless, IP-bound, 5-minute challenge buckets |
| Service Bindings | `EXTENDED_VALIDATION` (vrfy-extended) + `YOKE` (yoke.lol domain intel) |

## API Endpoints

### POST (rate-limited, require JSON body)

| Endpoint | Description |
|----------|-------------|
| `POST /` | Validate a single email (`{email, quick?, force?, stream?, pow?}`) |
| `POST /batch` | Validate up to 20 emails (`{emails[], quick?, force?, pow?}`) |

### GET (static, no rate limit)

| Endpoint | Description |
|----------|-------------|
| `GET /` | API root (JSON for `curl`) or SPA landing (HTML for browsers) |
| `GET /about` | About page |
| `GET /api/docs` | API documentation |
| `GET /api/usage` | Admin usage stats (HTTP Basic Auth, requires `ADMIN_KEY`) |
| `GET /cli` | CLI & libraries page |
| `GET /health` | Health check (`{"status":"ok","version":"1.0.0"}`) |
| `GET /pow` | Proof of Work protocol docs |
| `GET /privacy` | Privacy policy |
| `GET /status` | Service status page (live browser-side health check) |
| `GET /terms` | Terms of use |
| `GET /usage` | Usage dashboard (admin SPA, HTTP Basic Auth gated) |
| `GET /favicon.svg` | SVG favicon |
| `GET /robots.txt` | Robots file |
| `GET /sitemap.xml` | Sitemap |
| `GET /.well-known/security.txt` | Security contact |

### Other

| Method | Behavior |
|--------|----------|
| `OPTIONS` | CORS preflight (204) |
| `HEAD` | 200 OK |
| `GET /{email@...}` | 405 with POST-only guidance |
| Everything else | 404 |

## Infrastructure

| Resource | Details |
|----------|---------|
| Domain | vrfy.lol |
| GitHub | yokedotlol/vrfy-lol (private until launch) |
| Zone ID | `17c5e0dd21faa482187d027435914a45` |
| KV namespace | `d0c2357c7b5a4a2fb6c434f0425e5f78` (binding: `CACHE`) |
| DO class | `RateLimiterDO` (migration tag: `v1`) |
| Contact email | hello@yoke.lol (shared .lol family email) |
| Service bindings | `vrfy-extended` (EXTENDED_VALIDATION), `yoke` (YOKE) |

### Secrets (via `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `CACHE_SECRET` | HMAC key for email-level cache keys (pseudonymized) |
| `POW_SECRET` | HMAC key for PoW challenge generation (IP-bound) |
| `ADMIN_KEY` | HTTP Basic Auth for `/usage` and `/api/usage` |
| `SERVICE_KEY` | Shared key for .lol family service bindings (yoke) |
| `FLY_AUTH_SECRET` | Bearer token for Fly probe auth (Phase 2, unused) |

## Validation Pipeline

```
email input
  → syntax (RFC 5321, EAI, IP literals, quoted local parts)
  → domain cache check (KV, domain-only key, 7-day TTL)
  → if miss:
      → parallel: MX lookup, yoke service binding, SRV services, NS provider, domain age (RDAP)
      → if yoke unavailable: inline DMARC/SPF/BIMI/MTA-STS/TLS-RPT/DNSSEC/DKIM probing
      → DANE TLSA (requires MX hosts)
      → domain heuristics (risky TLD, entropy, MX fingerprint, self-hosted detection, subdomain)
      → cache domain results (7-day TTL)
  → local-part checks: role account, typo detection, subaddress, spam trap, pattern classification
  → extended validation (if vrfy-extended bound): HMAC-cached (30-day), existence signals
  → action determination (allow/verify/block)
  → confidence classification (valid/likely_valid/risky/invalid/unknown)
  → heuristic adjustments (spam trap → block, risky TLD → verify, etc.)
  → security posture adjustments (grade A boost, new domain → verify, etc.)
  → extended score adjustments (high score → confidence boost)
```

## Extended Signals

Extended validation runs via the `vrfy-extended` service binding (closed-source plugin). Signals visible with admin key:

| Signal | Source | Description |
|--------|--------|-------------|
| gravatar | Gravatar API | MD5 hash profile lookup (~260M profiles) |
| github | GitHub API | Public commit email search |
| xon | XposedOrNot | Breach database (free, no API key) |
| webfinger | Target domain | RFC 7033 account discovery |
| gitlab | GitLab API | Public account search |
| pgp | keys.openpgp.org | OpenPGP key server lookup |
| keybase | Keybase API | Identity graph (~400K users) |
| libravatar | Libravatar | Federated avatar (FOSS/privacy users) |
| microsoft | GetCredentialType | M365/Outlook/Hotmail/Live existence (weight 0.35) |
| emailrep | EmailRep.io | Reputation + platform profiles (8/day self-cap) |
| wkd | WKD | Web Key Directory lookup |
| openpgpkey_dns | DNS | OPENPGPKEY DNS record |
| smimea | DNS | S/MIME certificate association |

Score is computed as soft-OR across weighted signals. Max theoretical ≈ 0.976.

## Data Files

| File | Contents | Source |
|------|----------|--------|
| `data/disposable.ts` | 141K+ disposable email domains | CC0 list + API |
| `data/free-providers.ts` | Known free email providers | Curated |
| `data/privacy-relays.ts` | Apple HME, SimpleLogin, Addy.io, Firefox Relay, DuckDuckGo | Curated |
| `data/providers.ts` | 20+ email providers with MX patterns + behavior hints | Curated |
| `data/role-accounts.ts` | Role account local parts (admin, info, support, etc.) | Curated |
| `data/typos.ts` | Domain typo corrections (Levenshtein + curated map) | Curated |

## Open / Known Issues

- No TODO/FIXME/HACK comments in codebase (clean)
- Repo is private — needs to be flipped public at launch
- Phase 2 (Fly.io probe for DNSBL) not started
- Spamhaus DBL deferred pending usage data to justify spend
- EmailRep.io free tier cap (250/month, 10/day) — platform key self-limits at 8/day
