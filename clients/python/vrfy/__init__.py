"""
vrfy — Email validation client for vrfy.lol

No SMTP probes. No API keys. Proof-of-work anti-abuse.

Usage::

    from vrfy import validate, validate_batch

    result = validate("user@example.com")
    print(result["action"])  # "allow", "verify", or "block"

    results = validate_batch(["alice@gmail.com", "bob@company.com"])
    for r in results["results"]:
        print(f"{r['email']} → {r['action']}")
"""

from __future__ import annotations

import hashlib
import json
import urllib.request
import urllib.error
from typing import Any, Optional

__all__ = ["validate", "validate_batch", "solve_pow", "VrfyError"]
__version__ = "1.0.0"

DEFAULT_BASE_URL = "https://vrfy.lol"


class VrfyError(Exception):
    """Raised when the vrfy.lol API returns an error."""

    def __init__(self, message: str, status: int = 0, code: str = ""):
        super().__init__(message)
        self.status = status
        self.code = code


def validate(
    email: str,
    *,
    quick: bool = False,
    force: bool = False,
    dkim: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
) -> dict[str, Any]:
    """
    Validate a single email address.

    Automatically solves proof-of-work challenges when rate-limited.

    Args:
        email: Email address to validate.
        quick: If True, return Tier 1 signals only (faster).
        force: If True, bypass server cache.
        dkim: Set to "full" for extended DKIM probing.
        base_url: Override API base URL (for self-hosted instances).

    Returns:
        dict with keys: email, action, confidence, validation, enrichment,
        security, _meta.
    """
    body: dict[str, Any] = {"email": email}
    if quick:
        body["quick"] = True
    if force:
        body["force"] = True
    if dkim:
        body["dkim"] = dkim

    return _post_with_pow(f"{base_url}/", body)


def validate_batch(
    emails: list[str],
    *,
    quick: bool = False,
    force: bool = False,
    base_url: str = DEFAULT_BASE_URL,
) -> dict[str, Any]:
    """
    Validate up to 20 email addresses in one request.

    Automatically solves proof-of-work challenges when rate-limited.

    Args:
        emails: List of email addresses (max 20).
        quick: If True, return Tier 1 signals only.
        force: If True, bypass server cache.
        base_url: Override API base URL.

    Returns:
        dict with keys: results (list), batch_ms, domains_queried.
    """
    if not emails:
        raise VrfyError("Empty email list")
    if len(emails) > 20:
        raise VrfyError(f"Batch size {len(emails)} exceeds maximum of 20")

    body: dict[str, Any] = {"emails": emails}
    if quick:
        body["quick"] = True
    if force:
        body["force"] = True

    return _post_with_pow(f"{base_url}/batch", body)


# ─── HTTP + PoW ───


def _post_with_pow(url: str, body: dict[str, Any]) -> dict[str, Any]:
    """POST with transparent proof-of-work on 429."""
    data, status = _post(url, body)

    if status == 200:
        return data

    if status != 429:
        msg = data.get("message", f"API error {status}") if isinstance(data, dict) else f"API error {status}"
        raise VrfyError(msg, status=status, code=data.get("error", "") if isinstance(data, dict) else "")

    # 429 — solve PoW
    if not isinstance(data, dict) or "pow" not in data:
        raise VrfyError("Rate limited with no PoW challenge", status=429)

    challenge_obj = data["pow"]
    nonce = solve_pow(challenge_obj["challenge"], challenge_obj["difficulty"])
    body["pow"] = {"challenge": challenge_obj["challenge"], "nonce": str(nonce)}

    data, status = _post(url, body)
    if status != 200:
        raise VrfyError(f"Request failed after PoW (status {status})", status=status)
    return data


def _post(url: str, body: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Raw POST request. Returns (parsed_json, status_code)."""
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": f"vrfy-python/{__version__}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read()), e.code
        except Exception:
            raise VrfyError(f"HTTP {e.code}: {e.reason}", status=e.code) from e
    except urllib.error.URLError as e:
        raise VrfyError(f"Connection failed: {e.reason}") from e


# ─── PoW Solver ───


def solve_pow(challenge: str, difficulty: int) -> int:
    """
    Find nonce where SHA-256(challenge + ":" + nonce) has >= difficulty leading zero bits.

    Args:
        challenge: Hex challenge string from the API.
        difficulty: Required number of leading zero bits.

    Returns:
        The nonce (integer) that satisfies the difficulty requirement.
    """
    prefix = f"{challenge}:".encode("utf-8")

    for nonce in range(2**53):
        data = prefix + str(nonce).encode("utf-8")
        h = hashlib.sha256(data).digest()
        if _count_leading_zero_bits(h) >= difficulty:
            return nonce

    raise VrfyError("Exhausted nonce space")


def _count_leading_zero_bits(hash_bytes: bytes) -> int:
    """Count leading zero bits in a byte string."""
    bits = 0
    for b in hash_bytes:
        if b == 0:
            bits += 8
            continue
        # Count leading zeros in this byte
        mask = 0x80
        while mask and not (b & mask):
            bits += 1
            mask >>= 1
        break
    return bits
