# vrfy.lol — Project Constitution

> Stable identity, architecture, and red lines. Changes here are rare and require discussion.

## What vrfy.lol Is

Free, open-source email address validation API at [vrfy.lol](https://vrfy.lol). Users submit an email → get comprehensive DNS-based validation with an actionable `allow`/`verify`/`block` recommendation. MIT license, repo at `yokedotlol/vrfy-lol`.

**Tagline:** *"Know everything DNS can tell you about an email address."*

## Architecture

| Layer | Technology | Location |
|-------|-----------|----------|
| Worker | Cloudflare Workers (TypeScript, zero-framework) | `src/` |

> **Phase 2:** A Go probe service on Fly.io (`vrfy-probe/`) is planned for DNSBL queries that require direct DNS resolution.

### Storage
- **KV `CACHE`** — domain-level result cache (1hr TTL). Cache keys are domains only, never email addresses.
- **Durable Object `RateLimiterDO`** — per-IP rate limiting (10/min).

### Self-Hosting
Fork repo → `wrangler deploy`. No Docker, no second server needed for Phase 1. Fly probe also self-hostable for Phase 2+.

## The .lol Family

vrfy.lol is part of a family of developer utilities that share the same ethos and stack conventions. Each tool stands on its own — no cross-linking, no funnels between tools.

| Project | What it does |
|---------|-------------|
| yoke.lol | Domain intelligence (the hub) |
| certs.lol | TLS/SSL certificate analysis |
| ns.lol | DNS toolkit |
| **vrfy.lol** | Email address validation |
| xhttp.lol | HTTP response debugger |

## Core Principles

1. **No SMTP probes.** Positioned as a feature, not a limitation. DNS-only analysis, honest about what we can and can't tell you.
2. **No accounts, no tracking, no API keys.** Fair-use IP rate limits only.
3. **$0 forever.** MIT licensed.
4. **The `action` field is the product.** `allow`/`verify`/`block` — one field a developer can build on.
5. **Privacy by design.** Domain-level caching only. Local parts never hit persistent storage.

## Red Lines

- **No SMTP.** Do not add SMTP verification. Ever. This is the product identity.
- **No accounts or API keys.** IP-based rate limiting only.
- **No `as any`.** TypeScript strict mode, no escape hatches.
- **No bundling unlicensed data.** CC0/MIT-compatible datasets only. FakeFilter and similar unlicensed lists are API-only at runtime.
- **Secrets never in code or wrangler.toml.** Use `wrangler secret put`.
- **Email addresses never in persistent storage.** KV cache keys are domain-only.

## Cost Awareness

Same model as the .lol family — usage-based CF pricing. Keep per-request cost minimal.

- KV reads: $0.50/M (use for cache)
- KV writes: $5.00/M (cache domain results, not per-email)
- DO requests: $0.15/M (rate limiting)
- DoH queries: free (Cloudflare's own resolver)

## .context/ Maintenance Protocol

Same as Yoke: CONSTITUTION changes are rare and require discussion. DECISIONS is append-only. INVARIANTS require explicit approval to add/remove.
