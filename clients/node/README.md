# @yokedotlol/vrfy

Email validation client for [vrfy.lol](https://vrfy.lol) — no SMTP probes, no API keys.

Automatically solves proof-of-work challenges when rate-limited. Zero configuration.

## Install

```bash
npm install @yokedotlol/vrfy
```

## Library Usage

```typescript
import { validate, validateBatch } from '@yokedotlol/vrfy';

// Single email
const result = await validate('user@example.com');
console.log(result.action);     // 'allow' | 'verify' | 'block'
console.log(result.confidence); // 'valid' | 'likely_valid' | 'risky' | 'invalid' | 'unknown'

if (result.action === 'block') {
  console.log('Rejected');
} else if (result.action === 'verify') {
  console.log('Send verification email');
}

// Check for typos
if (result.validation.has_typo) {
  console.log(`Did you mean: ${result.validation.typo_suggestion}?`);
}

// Batch (up to 20)
const batch = await validateBatch([
  'alice@gmail.com',
  'bob@company.com',
  'test@mailinator.com',
]);
for (const r of batch.results) {
  console.log(`${r.email} → ${r.action}`);
}
```

### Options

```typescript
// Quick mode (Tier 1 signals only — faster)
const result = await validate('user@example.com', { quick: true });

// Custom base URL (self-hosted)
const result = await validate('user@example.com', {
  baseURL: 'https://vrfy.internal.example.com',
});
```

## CLI Usage

```bash
# Validate an email
npx @yokedotlol/vrfy user@example.com

# Multiple emails
npx @yokedotlol/vrfy alice@gmail.com bob@company.com

# JSON output
npx @yokedotlol/vrfy --json user@example.com

# From file
npx @yokedotlol/vrfy --batch emails.txt

# From stdin
echo "user@example.com" | npx @yokedotlol/vrfy -
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | `allow` — email looks good |
| 1 | `block` — invalid/disposable/no MX |
| 2 | `verify` — send a verification email |

## How It Works

When the free rate limit is exceeded (10/hour + 50/day per IP), the API returns a proof-of-work challenge. This client solves it automatically using SHA-256 hashcash (~200ms on modern hardware). No API keys, no accounts, no billing.

## License

MIT
