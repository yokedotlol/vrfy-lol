#!/usr/bin/env bash
# ─── vrfy.sh — Email validation from your terminal ───
# No dependencies beyond curl + openssl.
# Part of the .lol family: https://vrfy.lol
#
# Usage:
#   ./vrfy.sh user@example.com
#   ./vrfy.sh user@example.com admin@company.com
#   curl -sL vrfy.lol/vrfy.sh | bash -s -- user@example.com
#   echo "user@example.com" | ./vrfy.sh -
#   ./vrfy.sh --batch emails.txt
#   ./vrfy.sh --json user@example.com
#
# Exit codes:
#   0  allow   — email looks good
#   1  block   — invalid/disposable/no MX
#   2  verify  — send a verification email

set -euo pipefail

VERSION="1.0.0"
BASE_URL="${VRFY_URL:-https://vrfy.lol}"
JSON_OUTPUT=false
QUICK=false

# ─── Colors (disabled when not a TTY) ───

if [ -t 1 ]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  GREEN='\033[38;5;79m'
  YELLOW='\033[38;5;221m'
  RED='\033[38;5;203m'
  RESET='\033[0m'
else
  BOLD='' DIM='' GREEN='' YELLOW='' RED='' RESET=''
fi

# ─── Helpers ───

die() { echo "Error: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
vrfy — email validation, no SMTP probes

Usage:
  vrfy.sh <email> [email...]    Validate email(s)
  vrfy.sh --batch <file>        Validate from file (one per line)
  echo "addr" | vrfy.sh -       Read from stdin
  vrfy.sh --json <email>        Output raw JSON

Options:
  --json         Output raw JSON
  --quick        Quick mode (Tier 1 signals only)
  --batch FILE   Read emails from file
  --url BASE     Override API base URL
  --help         Show this help
  --version      Show version

Environment:
  VRFY_URL       Override base URL (default: https://vrfy.lol)

Exit codes:
  0  allow    email looks good
  1  block    invalid/disposable/no MX
  2  verify   send a verification email

https://vrfy.lol
EOF
  exit 0
}

# ─── PoW Solver ───
# Find nonce where SHA-256(challenge:nonce) has >= difficulty leading zero bits.
# Uses openssl for hashing — available everywhere curl is.

solve_pow() {
  local challenge="$1"
  local difficulty="$2"
  local nonce=0

  # How many full zero bytes + remaining bits we need
  local full_bytes=$((difficulty / 8))
  local remaining_bits=$((difficulty % 8))

  while true; do
    local hash
    hash=$(printf '%s:%d' "$challenge" "$nonce" | openssl dgst -sha256 -binary | xxd -p -c 32)

    # Check full zero bytes
    local ok=true
    local pos=0
    for ((i = 0; i < full_bytes; i++)); do
      local byte="${hash:$pos:2}"
      if [ "$byte" != "00" ]; then
        ok=false
        break
      fi
      pos=$((pos + 2))
    done

    # Check remaining bits
    if $ok && [ "$remaining_bits" -gt 0 ]; then
      local byte_hex="${hash:$pos:2}"
      local byte_dec=$((16#$byte_hex))
      local mask=$(( (256 >> remaining_bits) - 1 ))
      local inverse_mask=$(( 255 - mask ))
      if [ $((byte_dec & inverse_mask)) -ne 0 ]; then
        ok=false
      fi
    fi

    if $ok; then
      echo "$nonce"
      return 0
    fi

    nonce=$((nonce + 1))

    # Safety valve — shouldn't hit this with difficulty 18-22
    if [ "$nonce" -gt 50000000 ]; then
      die "PoW solver exceeded safety limit"
    fi
  done
}

# ─── API calls ───

# POST to vrfy.lol, handle 429 + PoW transparently
vrfy_post() {
  local url="$1"
  local body="$2"

  local response http_code
  response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "User-Agent: vrfy-bash/$VERSION" \
    -d "$body" \
    --max-time 30)

  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    echo "$response"
    return 0
  fi

  if [ "$http_code" != "429" ]; then
    local msg
    msg=$(echo "$response" | grep -o '"message":"[^"]*"' | head -1 | sed 's/"message":"//;s/"//')
    die "${msg:-API error $http_code}"
  fi

  # 429 — extract challenge and solve PoW
  local challenge difficulty
  challenge=$(echo "$response" | grep -o '"challenge":"[^"]*"' | head -1 | sed 's/"challenge":"//;s/"//')
  difficulty=$(echo "$response" | grep -o '"difficulty":[0-9]*' | head -1 | sed 's/"difficulty"://')

  if [ -z "$challenge" ] || [ -z "$difficulty" ]; then
    die "Rate limited but no PoW challenge in response"
  fi

  echo "Solving proof-of-work (difficulty $difficulty)..." >&2
  local nonce
  nonce=$(solve_pow "$challenge" "$difficulty")
  echo "Solved (nonce: $nonce)" >&2

  # Inject PoW solution into body
  # Remove trailing } and append pow field
  local pow_body
  pow_body=$(echo "$body" | sed 's/}$//')
  pow_body="${pow_body},\"pow\":{\"challenge\":\"$challenge\",\"nonce\":\"$nonce\"}}"

  response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "User-Agent: vrfy-bash/$VERSION" \
    -d "$pow_body" \
    --max-time 30)

  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    echo "$response"
    return 0
  fi

  die "Request failed after PoW (status $http_code)"
}

# ─── Output formatting ───

print_result() {
  local json="$1"

  if $JSON_OUTPUT; then
    echo "$json"
    return
  fi

  local email action confidence
  email=$(echo "$json" | grep -o '"email":"[^"]*"' | head -1 | sed 's/"email":"//;s/"//')
  action=$(echo "$json" | grep -o '"action":"[^"]*"' | head -1 | sed 's/"action":"//;s/"//')
  confidence=$(echo "$json" | grep -o '"confidence":"[^"]*"' | head -1 | sed 's/"confidence":"//;s/"//')

  local action_label
  case "$action" in
    allow)  action_label="${GREEN}${BOLD}✓ allow${RESET}" ;;
    verify) action_label="${YELLOW}${BOLD}⚠ verify${RESET}" ;;
    block)  action_label="${RED}${BOLD}✗ block${RESET}" ;;
    *)      action_label="$action" ;;
  esac

  if [ ! -t 1 ]; then
    printf '%s\t%s\t%s\n' "$email" "$action" "$confidence"
    return
  fi

  printf "${BOLD}%s${RESET}  %b\n" "$email" "$action_label"
  printf "  ${DIM}confidence:${RESET} %s\n" "$confidence"

  # Disposable check
  if echo "$json" | grep -q '"disposable":true'; then
    printf "  ${RED}⚠ disposable domain${RESET}\n"
  fi

  # Typo check
  local typo_suggestion
  typo_suggestion=$(echo "$json" | grep -o '"typo_suggestion":"[^"]*"' | head -1 | sed 's/"typo_suggestion":"//;s/"//')
  if [ -n "$typo_suggestion" ] && [ "$typo_suggestion" != "null" ]; then
    printf "  ${YELLOW}typo?${RESET} %s\n" "$typo_suggestion"
  fi

  # Free provider
  if echo "$json" | grep -q '"free_provider":true'; then
    printf "  ${DIM}free provider${RESET}\n"
  fi

  # Role account
  if echo "$json" | grep -q '"role_account":true'; then
    printf "  ${DIM}role account${RESET}\n"
  fi
}

# ─── Main ───

EMAILS=()
BATCH_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage ;;
    --version) echo "vrfy $VERSION"; exit 0 ;;
    --json) JSON_OUTPUT=true; shift ;;
    --quick) QUICK=true; shift ;;
    --batch) BATCH_FILE="$2"; shift 2 ;;
    --url) BASE_URL="$2"; shift 2 ;;
    -) # Read from stdin
      while IFS= read -r line; do
        line=$(echo "$line" | xargs)
        [ -n "$line" ] && [[ ! "$line" =~ ^# ]] && EMAILS+=("$line")
      done
      shift
      ;;
    --*) die "Unknown option: $1" ;;
    *) EMAILS+=("$1"); shift ;;
  esac
done

# Read batch file
if [ -n "$BATCH_FILE" ]; then
  while IFS= read -r line; do
    line=$(echo "$line" | xargs)
    [ -n "$line" ] && [[ ! "$line" =~ ^# ]] && EMAILS+=("$line")
  done < "$BATCH_FILE"
fi

if [ ${#EMAILS[@]} -eq 0 ]; then
  die "No email addresses provided. Use --help for usage."
fi

# Single email
if [ ${#EMAILS[@]} -eq 1 ]; then
  body="{\"email\":\"${EMAILS[0]}\"}"
  [ "$QUICK" = true ] && body="{\"email\":\"${EMAILS[0]}\",\"quick\":true}"

  result=$(vrfy_post "$BASE_URL/" "$body")
  print_result "$result"

  action=$(echo "$result" | grep -o '"action":"[^"]*"' | head -1 | sed 's/"action":"//;s/"//')
  case "$action" in
    block) exit 1 ;;
    verify) exit 2 ;;
  esac
  exit 0
fi

# Batch — up to 20 at a time
HAS_BLOCK=false
FIRST=true
for ((i = 0; i < ${#EMAILS[@]}; i += 20)); do
  chunk=("${EMAILS[@]:$i:20}")

  # Build JSON array
  json_emails=""
  for e in "${chunk[@]}"; do
    [ -n "$json_emails" ] && json_emails="$json_emails,"
    json_emails="$json_emails\"$e\""
  done

  body="{\"emails\":[$json_emails]}"
  [ "$QUICK" = true ] && body="{\"emails\":[$json_emails],\"quick\":true}"

  result=$(vrfy_post "$BASE_URL/batch" "$body")

  if $JSON_OUTPUT; then
    echo "$result"
  else
    # Extract individual results (best-effort without jq)
    # If jq is available, use it for proper parsing
    if command -v jq &>/dev/null; then
      count=$(echo "$result" | jq '.results | length')
      for ((j = 0; j < count; j++)); do
        $FIRST || echo
        FIRST=false
        item=$(echo "$result" | jq ".results[$j]")
        print_result "$item"
        action=$(echo "$item" | jq -r '.action')
        [ "$action" = "block" ] && HAS_BLOCK=true
      done
    else
      # Fallback: print raw JSON
      echo "$result"
    fi
  fi
done

$HAS_BLOCK && exit 1
exit 0
