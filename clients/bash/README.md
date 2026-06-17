# vrfy.sh

Standalone bash script for [vrfy.lol](https://vrfy.lol) email validation.

Zero dependencies beyond `curl` and `openssl` (both pre-installed on macOS and most Linux distros). Automatically solves proof-of-work challenges.

## One-liner

```bash
curl -sL vrfy.lol/vrfy.sh | bash -s -- user@example.com
```

## Install

```bash
# Download
curl -sLo vrfy.sh https://vrfy.lol/vrfy.sh
chmod +x vrfy.sh

# Or copy to PATH
sudo cp vrfy.sh /usr/local/bin/vrfy
```

## Usage

```bash
# Single email
./vrfy.sh user@example.com

# Multiple emails
./vrfy.sh alice@gmail.com bob@company.com

# From file
./vrfy.sh --batch emails.txt

# From stdin
echo "user@example.com" | ./vrfy.sh -
cat emails.txt | ./vrfy.sh -

# JSON output (pipe to jq)
./vrfy.sh --json user@example.com | jq .action

# Quick mode
./vrfy.sh --quick user@example.com
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

## Scripting Examples

```bash
# Gate a sign-up script
if ./vrfy.sh --quick "$EMAIL" >/dev/null 2>&1; then
  echo "Email OK"
else
  echo "Bad email"
fi

# Bulk check with results
while IFS= read -r email; do
  result=$(./vrfy.sh --json "$email" 2>/dev/null)
  action=$(echo "$result" | grep -o '"action":"[^"]*"' | sed 's/"action":"//;s/"//')
  echo "$email → $action"
done < emails.txt
```

## License

MIT
