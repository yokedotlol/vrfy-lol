# vrfy.lol

**Email validation without SMTP probes.** No accounts. No tracking. MIT licensed.

vrfy.lol validates email addresses using DNS signals, domain heuristics, and public identity graphs — never by connecting to a mail server. POST-only API, proof-of-work abuse prevention, zero PII storage.

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
    "signals": 18,
    "signals_positive": 16,
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

## Signals (26 total)

### Base Layer (open source, 18 signals)
- **Syntax** — RFC 5321 validation, internationalized email support
- **MX Records** — DNS lookup via DoH, null MX detection, A-record fallback
- **Disposable Detection** — 141,000+ known throwaway domains
- **Privacy Relay** — Apple, Firefox, DuckDuckGo relay classification
- **Free Provider** — Gmail, Yahoo, Outlook, etc.
- **Role Account** — `admin@`, `postmaster@`, `noreply@`, etc.
- **Typo Detection** — Levenshtein distance against known providers
- **Provider ID** — MX-based provider identification with behavior hints
- **Subaddress** — `+tag` detection with base address extraction
- **DMARC** — Policy analysis (none/quarantine/reject)
- **SPF** — Record presence and strictness
- **BIMI** — Brand indicator record detection
- **MTA-STS** — Strict transport security for email
- **MX Fingerprinting** — Enterprise/consumer/self-hosted/forwarding classification + security gateway detection
- **Risky TLD** — 34 TLDs associated with abuse
- **Domain Entropy** — Shannon entropy for randomly-generated domain detection
- **Spam Trap** — Pattern-based spam trap identification
- **Security Grade** — A+ through F composite email security posture

### Extended Layer (proprietary, 8 signals)
The optional closed-source plugin adds existence signals via [Cloudflare Service Binding](https://developers.cloudflare.com/workers/configuration/bindings/about-service-bindings/). Returns an opaque 0.0–1.0 score. Self-hosters get everything above; the extended layer is a confidence boost, not a gate.

- Gravatar hash lookup (~260M profiles)
- GitHub commit email search
- WebFinger (RFC 7033) account discovery
- PGP key lookup (keys.openpgp.org)
- Keybase identity graph
- XON (cross-origin name resolution)
- Libravatar (federated avatar service)
- GitLab account discovery

## Rate Limits

| Tier | Limit | How |
|------|-------|-----|
| Free | 10 requests/hour + 50/day per IP | Automatic |
| PoW bypass | Unlimited | Solve a SHA-256 hashcash challenge |
| Cached | Doesn't count | Domain results cached 7 days |

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

# Domain-only lookup (GET)
curl -s https://vrfy.lol/example.com | jq
```

## Self-Hosting

vrfy.lol runs on [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
git clone https://github.com/yokedotlol/vrfy-lol.git
cd vrfy-lol
bun install

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

## Privacy

- **POST-only** — emails never appear in URLs, logs, or CDN analytics
- **No accounts** — proof-of-work replaces API keys, so no user data to store
- **No SMTP probes** — we never connect to mail servers
- **HMAC-keyed cache** — email-level cache keys are pseudonymized
- **Domain-level cache** — only domain names cached, not email addresses

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

## License

MIT — see [LICENSE](LICENSE).
