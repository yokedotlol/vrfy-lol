# vrfy — Go client for vrfy.lol

Email validation without SMTP probes. Part of the [.lol family](https://yoke.lol).

## Install CLI

```bash
# Homebrew
brew install yokedotlol/tap/vrfy

# Go
go install github.com/yokedotlol/vrfy/cmd/vrfy@latest

# Download binary
curl -sSL https://vrfy.lol/install.sh | bash
```

## CLI Usage

```bash
# Validate a single email
vrfy check user@example.com

# Multiple emails
vrfy check alice@gmail.com bob@company.com

# Batch from file (one email per line)
vrfy check --batch emails.txt

# Pipe from stdin
echo "user@example.com" | vrfy check -

# JSON output
vrfy check --json user@example.com

# Quick mode (Tier 1 signals only, faster)
vrfy check --quick user@example.com
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | `allow` — email looks good |
| 1 | `block` — invalid/disposable/no MX |
| 2 | `verify` — send a verification email |

## Library Usage

```go
package main

import (
    "fmt"
    "log"

    "github.com/yokedotlol/vrfy"
)

func main() {
    // Single email
    result, err := vrfy.Validate("user@example.com")
    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(result.Action)     // "allow", "verify", or "block"
    fmt.Println(result.Confidence) // "valid", "likely_valid", "risky", "invalid", "unknown"

    if result.Validation.HasTypo {
        fmt.Println("Did you mean:", *result.Validation.TypoSuggestion)
    }

    // Batch (up to 20)
    batch, err := vrfy.ValidateBatch([]string{
        "alice@gmail.com",
        "bob@company.com",
        "test@mailinator.com",
    })
    if err != nil {
        log.Fatal(err)
    }
    for _, r := range batch.Results {
        fmt.Printf("%s → %s\n", r.Email, r.Action)
    }
}
```

### Custom Client

```go
client := vrfy.NewClient()
client.BaseURL = "https://your-self-hosted-vrfy.example.com"

result, err := client.Validate("user@example.com")
```

## Proof of Work

The client automatically solves proof-of-work challenges when rate-limited.
No API keys needed — just CPU cycles. This is transparent to the caller.

## License

MIT
