# vrfy.lol

**Email validation without SMTP probes.** No accounts. No tracking. MIT licensed.

vrfy.lol validates email addresses using DNS signals, domain heuristics, and public identity graphs — never by connecting to a mail server. POST-only API (405 on GET), proof-of-work abuse prevention, raw email never stored — extended cache HMAC 30d, domain cache 7d, hashed IP only for rate limiting.

## Quick Start

```bash
# Single email
curl -s -X POST https://vrfy.lol/ \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}' | jq .

# Batch (up to 20)
curl -s -X POST https://vrfy.lol/batch \
  -H 'Content-Type: application/json' \
  -d '{"emails": ["a@example.com", "b@test.org"]}' | jq .
```

## Response

```json
{
  "email": "user@example.com",
  "action": "allow",
  "confidence": "valid",
  "validation": {
    "syntax_valid": true,
    "mx_found": true,
    "disposable": false,
    "privacy_relay": false,
    "free_provider": false,
    "role_account": false,
    "has_typo": false,
    "provider": { "name": "Google Workspace", "is_free": false },
    "subaddressed": false
  },
  "security": {
    "grade": "A",
    "spf": true,
    "dmarc": { "found": true, "policy": "reject" },
    "bimi": true,
    "mta_sts": true
  },
  "_meta": {
    "signals": 28,
    "signals_positive": 24,
    "cached": false,
    "query_ms": 142,
    "version": "1.0.0"
  }
}
```

### Action Values

| Action | Meaning | Recommended handling |
|--------|---------|---------------------|
| `allow` | High confidence, proceed | Accept the email |
| `verify` | Uncertain, needs confirmation | Send a verification email |
| `block` | Strong negative signals | Reject or flag for review |

## Signals (41 scored, +3 informational)

### Base Layer (open source, 28 scored signals +3 informational checks = 31 checks)
- **Syntax** — RFC 5321 validation, internationalized email support
- **MX Records** — DNS lookup via DoH, null MX detection, A-record fallback
- **Disposable Detection** — 141,000+ known throwaway domains
- **Privacy Relay** — Apple, Firefox, DuckDuckGo relay classification
- **Free Provider** — Gmail, Yahoo, Outlook, etc.
- **Role Account** — `admin@`, `postmaster@`, `noreply@`, etc.
- **Typo Detection** — Levenshtein distance against known providers
- **Provider ID** — MX-based provider identification with behavior hints
- **Subaddress** — `+tag` detection with base address extraction
- **IP Literal** — RFC 5321 §4.1.3 IP address domain detection (`[1.1.1.1]`, `[IPv6:...]`) — informational, not scored
- **Internationalized (EAI)** — SMTPUTF8/IDN domain detection — informational
- **Punycode** — `xn--` encoded domain label detection (homograph attack vector) — informational
- **DMARC** — Policy analysis (none/quarantine/reject)
- **SPF** — Record presence and strictness
- **BIMI** — Brand indicator record detection
- **MTA-STS** — Strict transport security for email
- **TLS-RPT** — TLS reporting policy detection
- **DANE TLSA** — DNS-based authentication of named entities
- **DNSSEC** — DNS security extensions validation
- **MX Fingerprinting** — Enterprise/consumer/self-hosted/forwarding classification + security gateway detection
- **Risky TLD** — 34 TLDs associated with abuse
- **Domain Entropy** — Shannon entropy for randomly-generated domain detection
- **Spam Trap** — Pattern-based spam trap identification
- **Subdomain Detection** — Subdomain vs apex analysis
- **NS Provider** — Nameserver provider identification
- **SMTP Submission** — SRV-based submission service detection
- **IMAP Service** — SRV-based IMAP service detection
- **Domain Age** — Newly-registered domain detection
- **DKIM Selectors** — Common DKIM selector probing
- **Local-Part Pattern** — Random local-part detection
- **Security Grade** — A+ through F composite email security posture

### Extended Layer (proprietary, 13 signals)
The optional closed-source plugin adds existence signals via [Cloudflare Service Binding](https://developers.cloudflare.com/workers/configuration/bindings/about-service-bindings/). Returns an opaque 0.0–1.0 score. Self-hosters get everything above; the extended layer is a confidence boost, not a gate.

- Gravatar hash lookup (~260M profiles)
- GitHub commit email search
- WebFinger (RFC 7033) account discovery
- PGP key lookup (keys.openpgp.org)
- Keybase identity graph
- XON (XposedOrNot breach database)
- Libravatar (federated avatar service)
- GitLab account discovery
- Microsoft account existence probe
- EmailRep reputation and credential exposure check
- WKD (Web Key Directory) lookup
- OPENPGPKEY DNS record check (RFC 7929)
- SMIMEA DNS record check (RFC 8162)

## Rate Limits

| Tier | Limit | How |
|------|-------|-----|
| Free | 10 requests/hour + 50/day per IP | Automatic |
| PoW bypass | Unlimited | Solve a SHA-256 hashcash challenge |

The API returns a `pow` object with rate-limit responses. See `/api/docs` for the protocol.

## Usage

```bash
# Quick validation (syntax + MX only)
curl -s -X POST https://vrfy.lol/ \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com", "quick": true}' | jq

# Full validation
curl -s -X POST https://vrfy.lol/ \
  -H 'Content-Type: application/json' \
  -d '{"email": "user@example.com"}' | jq

```

## Self-Hosting

vrfy.lol runs on [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
git clone https://github.com/yokedotlol/vrfy-lol.git
cd vrfy-lol
bun install

# Generate disposable domain list (required before first deploy/typecheck)
bun run generate

# Set secrets
openssl rand -hex 32 | npx wrangler secret put CACHE_SECRET
openssl rand -hex 32 | npx wrangler secret put POW_SECRET

# Deploy
npx wrangler deploy
```

### Requirements
- Cloudflare Workers (free tier works)
- KV namespace for caching
- Durable Object for rate limiting

### Service bindings (optional)

`wrangler.toml` declares optional service bindings to sibling `.lol` workers (yoke, vrfy-extended). If you're self-hosting vrfy standalone, remove the `[[services]]` blocks from `wrangler.toml` before deploying — vrfy falls back to its own inline DNS checks automatically.

## Privacy

- **POST-only (405 on GET)** — emails never appear in URLs, server logs, CDN analytics, or browser history
- **Raw email never stored** — only derivatives cached; raw email processed in memory and discarded
- **Domain cache 7d** — `domain:{domain}` — DNS/MX/provider results, no email addresses
- **Extended cache 30d** — `extended:{hmac}` — HMAC-SHA256(email) pseudonymized key, 30 days fixed, not reversible
- **HMAC-keyed** — email-level cache uses HMAC-SHA256 with server secret; raw email never stored as key
- **Hashed IP only** — rate limiting via `IP_HASH_SALT`-hashed IP in Durable Object, counters expire, no raw IP logs retained
- **Cloudflare edge logs not accessed** — Cloudflare processes requests as CDN/compute; we do not access, store, or process their standard edge logs (IP, URL, timestamp)
- **Server logs** — no email addresses in logs; extended cache HMAC 30d, domain cache 7d
- **No accounts, no cookies, no SMTP probes** — PoW replaces API keys; we never connect to mail servers

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Validate a single email |
| `POST` | `/batch` | Validate up to 20 emails |
| `GET` | `/` | API info (JSON) or SPA (HTML, via Accept header) |
| `GET` | `/health` | Health check |

## Part of the .lol Family

- [yoke.lol](https://yoke.lol) — Domain intelligence
- [certs.lol](https://certs.lol) — TLS certificate analysis
- [ns.lol](https://ns.lol) — DNS lookup & propagation
- [xhttp.lol](https://xhttp.lol) — HTTP response debugging
- [vrfy.lol](https://vrfy.lol) — Email validation ← you are here

## License

MIT — see [LICENSE](LICENSE).
