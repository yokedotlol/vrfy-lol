"""
vrfy CLI — email validation from your terminal.

Usage:
    python -m vrfy user@example.com
    python -m vrfy --batch emails.txt
    python -m vrfy --json user@example.com
    echo "user@example.com" | python -m vrfy -
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from . import validate, validate_batch, VrfyError, __version__


# ANSI colors (only when TTY)
_TTY = sys.stdout.isatty()
RESET = "\033[0m" if _TTY else ""
BOLD = "\033[1m" if _TTY else ""
DIM = "\033[2m" if _TTY else ""
GREEN = "\033[38;5;79m" if _TTY else ""
YELLOW = "\033[38;5;221m" if _TTY else ""
RED = "\033[38;5;203m" if _TTY else ""


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="vrfy",
        description="Email validation — no SMTP probes, no API keys",
        epilog="https://vrfy.lol",
    )
    parser.add_argument("emails", nargs="*", help="Email address(es) to validate, or '-' for stdin")
    parser.add_argument("--json", action="store_true", dest="json_output", help="Output raw JSON")
    parser.add_argument("--quick", action="store_true", help="Quick mode (Tier 1 signals only)")
    parser.add_argument("--batch", metavar="FILE", help="Read emails from file (one per line)")
    parser.add_argument("--url", metavar="BASE_URL", help="Override API base URL")
    parser.add_argument("--version", action="version", version=f"vrfy {__version__}")

    args = parser.parse_args()
    emails: list[str] = []
    kwargs: dict[str, Any] = {}

    if args.quick:
        kwargs["quick"] = True
    if args.url:
        kwargs["base_url"] = args.url

    # Collect emails from batch file
    if args.batch:
        with open(args.batch) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    emails.append(line)

    # Collect from positional args / stdin
    for email in args.emails:
        if email == "-":
            for line in sys.stdin:
                line = line.strip()
                if line and not line.startswith("#"):
                    emails.append(line)
        else:
            emails.append(email)

    if not emails:
        parser.error("no email addresses provided")

    try:
        if len(emails) == 1:
            result = validate(emails[0], **kwargs)
            if args.json_output:
                print(json.dumps(result, indent=2))
            else:
                _print_result(result)
            _exit_for_action(result["action"])
        else:
            # Batch in chunks of 20
            all_results: list[dict[str, Any]] = []
            for i in range(0, len(emails), 20):
                chunk = emails[i : i + 20]
                batch = validate_batch(chunk, **kwargs)
                all_results.extend(batch["results"])

            if args.json_output:
                print(json.dumps(all_results, indent=2))
            else:
                for i, r in enumerate(all_results):
                    if i > 0:
                        print()
                    _print_result(r)

            if any(r["action"] == "block" for r in all_results):
                sys.exit(1)

    except VrfyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def _print_result(r: dict[str, Any]) -> None:
    action = r["action"]
    action_labels = {
        "allow": f"{GREEN}{BOLD}✓ allow{RESET}",
        "verify": f"{YELLOW}{BOLD}⚠ verify{RESET}",
        "block": f"{RED}{BOLD}✗ block{RESET}",
    }
    action_str = action_labels.get(action, action)

    if not _TTY:
        print(f"{r['email']}\t{action}\t{r['confidence']}")
        return

    print(f"{BOLD}{r['email']}{RESET}  {action_str}")
    print(f"  {DIM}confidence:{RESET} {r['confidence']}")

    v = r.get("validation", {})
    if v.get("provider"):
        print(f"  {DIM}provider:{RESET} {v['provider']['name']}")
    if v.get("disposable"):
        print(f"  {RED}⚠ disposable domain{RESET}")
    if v.get("privacy_relay"):
        svc = f" ({v['privacy_relay_service']})" if v.get("privacy_relay_service") else ""
        print(f"  {DIM}privacy relay{RESET}{svc}")
    if v.get("has_typo") and v.get("typo_suggestion"):
        print(f"  {YELLOW}typo?{RESET} {v['typo_suggestion']}")
    if v.get("free_provider"):
        print(f"  {DIM}free provider{RESET}")
    if v.get("role_account"):
        print(f"  {DIM}role account{RESET}")
    if v.get("subaddressed"):
        tag = f"+{v['subaddress_tag']}" if v.get("subaddress_tag") else ""
        print(f"  {DIM}subaddressed:{RESET} {tag}")

    security = r.get("security")
    if security:
        print(f"  {DIM}security:{RESET} {GREEN}{BOLD}{security['grade']}{RESET}")

    meta = r.get("_meta", {})
    cached = " (cached)" if meta.get("cached") else ""
    print(f"  {DIM}query:{RESET} {meta.get('query_ms', '?')}ms{cached}")


def _exit_for_action(action: str) -> None:
    if action == "block":
        sys.exit(1)
    if action == "verify":
        sys.exit(2)


if __name__ == "__main__":
    main()
