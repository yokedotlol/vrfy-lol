# vrfy

Email validation client for [vrfy.lol](https://vrfy.lol) — no SMTP probes, no API keys.

Zero dependencies. Automatically solves proof-of-work challenges when rate-limited.

> **Not yet published on PyPI.** Use by cloning the repo and importing directly.

## Library Usage

```python
from vrfy import validate, validate_batch

# Single email
result = validate("user@example.com")
print(result["action"])      # "allow", "verify", or "block"
print(result["confidence"])  # "valid", "likely_valid", "risky", "invalid", "unknown"

# Check for typos
if result["validation"]["has_typo"]:
    print(f"Did you mean: {result['validation']['typo_suggestion']}?")

# Batch (up to 20)
batch = validate_batch(["alice@gmail.com", "bob@company.com"])
for r in batch["results"]:
    print(f"{r['email']} → {r['action']}")
```

### Options

```python
# Quick mode (Tier 1 only — faster)
result = validate("user@example.com", quick=True)

# Force bypass cache
result = validate("user@example.com", force=True)

# Custom base URL (self-hosted)
result = validate("user@example.com", base_url="https://vrfy.internal.example.com")
```

### Error Handling

```python
from vrfy import validate, VrfyError

try:
    result = validate("user@example.com")
except VrfyError as e:
    print(f"Validation failed: {e}")
    print(f"Status: {e.status}, Code: {e.code}")
```

## CLI Usage

```bash
# Validate an email
python -m vrfy user@example.com

# JSON output
python -m vrfy --json user@example.com

# Quick mode
python -m vrfy --quick user@example.com
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | `allow` — email looks good |
| 1 | `block` — invalid/disposable/no MX |
| 2 | `verify` — send a verification email |

## How It Works

When the free rate limit is exceeded (10/hour + 50/day per IP), the API returns a proof-of-work challenge. This client solves it automatically using SHA-256 hashcash. No API keys, no accounts, no billing.

## License

MIT
