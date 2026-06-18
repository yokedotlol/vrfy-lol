# vrfy.sh

Standalone bash script for [vrfy.lol](https://vrfy.lol) email validation.

Zero dependencies beyond `curl` and `openssl` (both pre-installed on macOS and most Linux distros). Automatically solves proof-of-work challenges.

## Quick curl (no script needed)

```bash
# One-shot validation — just curl
curl -s -X POST https://vrfy.lol/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com"}' | jq

# Batch (up to 20)
curl -s -X POST https://vrfy.lol/batch \
  -H 'Content-Type: application/json' \
  -d '{"emails":["alice@gmail.com","bob@company.com"]}' | jq

# Just the verdict
curl -s -X POST https://vrfy.lol/ \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com"}' | jq -r .action
```

> **Note:** Raw curl won't handle proof-of-work challenges (429 responses).
> If you hit rate limits, use the full `vrfy.sh` script which solves PoW automatically.

## Install

```bash
# Copy from the repo
cp clients/bash/vrfy.sh /usr/local/bin/vrfy
chmod +x /usr/local/bin/vrfy
```

## Usage

```bash
# Single email
./vrfy.sh user@example.com

# Multiple emails
./vrfy.sh alice@gmail.com bob@company.com

# From file (one email per line)
./vrfy.sh --batch emails.txt

# From stdin
echo "user@example.com" | ./vrfy.sh -
cat emails.txt | ./vrfy.sh -

# JSON output (pipe to jq)
./vrfy.sh --json user@example.com | jq .action

# Quick mode (Tier 1 signals only, faster)
./vrfy.sh --quick user@example.com

# Self-hosted instance
VRFY_URL=https://vrfy.internal ./vrfy.sh user@example.com
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | `allow` — email looks good |
| 1 | `block` — invalid/disposable/no MX |
| 2 | `verify` — send a verification email |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VRFY_URL` | `https://vrfy.lol` | Override API base URL |

## PoW (Proof-of-Work)

vrfy.lol uses proof-of-work instead of API keys for abuse prevention. When you're rate-limited (HTTP 429), the response includes a SHA-256 hashcash challenge. The script solves it automatically using `openssl` — no interaction needed.

## License

MIT
