# vrfy — Go client for vrfy.lol

Email validation without SMTP probes. Part of the [.lol family](https://yoke.lol).

> **Not yet published.** This client is in the repo but not available via `go install` or Homebrew yet. Use the library by importing the module directly from source.

## Library Usage

```go
package main

import (
    "fmt"
    "log"

    vrfy "github.com/yokedotlol/vrfy-lol/clients/go"
)

func main() {
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
