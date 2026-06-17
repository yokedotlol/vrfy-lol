"""Tests for the vrfy Python SDK.

All HTTP calls are mocked — no live API traffic.
Run: cd clients/python && python -m pytest tests/ -v
"""

from __future__ import annotations

import hashlib
import io
import json
from http.client import HTTPResponse
from unittest.mock import MagicMock, patch

import pytest

from vrfy import VrfyError, _count_leading_zero_bits, solve_pow, validate, validate_batch


# ─── PoW Solver ───────────────────────────────────────────────────────────────


class TestCountLeadingZeroBits:
    """Matches the Go test vectors exactly."""

    @pytest.mark.parametrize(
        "data, expected",
        [
            (bytes([0x00, 0x00, 0x01]), 23),
            (bytes([0x00, 0x80]), 8),
            (bytes([0x80]), 0),
            (bytes([0x40]), 1),
            (bytes([0x20]), 2),
            (bytes([0x01]), 7),
            (bytes([0x00, 0x00, 0x00]), 24),
            (b"", 0),
        ],
    )
    def test_known_values(self, data: bytes, expected: int) -> None:
        assert _count_leading_zero_bits(data) == expected


class TestSolvePoW:
    CHALLENGE = "deadbeef01234567890abcdef01234567890abcdef01234567890abcdef012345"
    DIFFICULTY = 8  # low difficulty for fast tests

    def test_returns_valid_nonce(self) -> None:
        nonce = solve_pow(self.CHALLENGE, self.DIFFICULTY)
        digest = hashlib.sha256(f"{self.CHALLENGE}:{nonce}".encode()).digest()
        assert _count_leading_zero_bits(digest) >= self.DIFFICULTY

    def test_nonce_is_int(self) -> None:
        nonce = solve_pow(self.CHALLENGE, self.DIFFICULTY)
        assert isinstance(nonce, int)
        assert nonce >= 0


# ─── Mock helpers ─────────────────────────────────────────────────────────────


def _mock_response(status: int, body: dict) -> MagicMock:
    """Build a mock that quacks like an HTTPResponse from urlopen."""
    resp = MagicMock()
    resp.status = status
    resp.read.return_value = json.dumps(body).encode()
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


def _mock_http_error(status: int, body: dict):
    """Build an HTTPError with a readable body."""
    import urllib.error

    err = urllib.error.HTTPError(
        url="https://vrfy.lol/",
        code=status,
        msg="Error",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(json.dumps(body).encode()),
    )
    return err


# ─── validate() ───────────────────────────────────────────────────────────────


MOCK_RESULT = {
    "email": "test@example.com",
    "action": "allow",
    "confidence": "valid",
    "validation": {"syntax_valid": True, "mx_found": True},
    "_meta": {"signals": 42, "cached": False, "query_ms": 123, "version": "1.0.0"},
}


class TestValidate:
    @patch("vrfy.urllib.request.urlopen")
    def test_success(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response(200, MOCK_RESULT)

        result = validate("test@example.com", base_url="https://vrfy.lol")
        assert result["email"] == "test@example.com"
        assert result["action"] == "allow"

    @patch("vrfy.urllib.request.urlopen")
    def test_pow_retry(self, mock_urlopen: MagicMock) -> None:
        """First call returns 429 + PoW challenge; second succeeds."""
        challenge = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        pow_response = {
            "error": "rate_limited",
            "message": "Too many requests",
            "pow": {"algorithm": "sha-256", "challenge": challenge, "difficulty": 8, "expires": 9999999999},
        }

        # First call: 429 with PoW
        mock_urlopen.side_effect = [
            _mock_http_error(429, pow_response),
            _mock_response(200, MOCK_RESULT),
        ]

        result = validate("test@example.com", base_url="https://vrfy.lol")
        assert result["action"] == "allow"
        assert mock_urlopen.call_count == 2

        # Verify the retry request includes a pow field
        retry_call = mock_urlopen.call_args_list[1]
        retry_req = retry_call[0][0]
        retry_body = json.loads(retry_req.data)
        assert "pow" in retry_body
        assert retry_body["pow"]["challenge"] == challenge
        # Verify the nonce actually solves the challenge
        nonce = int(retry_body["pow"]["nonce"])
        digest = hashlib.sha256(f"{challenge}:{nonce}".encode()).digest()
        assert _count_leading_zero_bits(digest) >= 8

    @patch("vrfy.urllib.request.urlopen")
    def test_error_raises(self, mock_urlopen: MagicMock) -> None:
        error_body = {"error": "invalid_email", "message": "Invalid email syntax"}
        mock_urlopen.side_effect = _mock_http_error(400, error_body)

        with pytest.raises(VrfyError) as exc_info:
            validate("not-an-email", base_url="https://vrfy.lol")
        assert exc_info.value.status == 400


# ─── validate_batch() ────────────────────────────────────────────────────────


MOCK_BATCH_RESULT = {
    "results": [
        {**MOCK_RESULT, "email": "alice@gmail.com"},
        {**MOCK_RESULT, "email": "bob@company.com"},
    ],
    "batch_ms": 456,
    "domains_queried": 2,
}


class TestValidateBatch:
    @patch("vrfy.urllib.request.urlopen")
    def test_success(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value = _mock_response(200, MOCK_BATCH_RESULT)

        result = validate_batch(["alice@gmail.com", "bob@company.com"], base_url="https://vrfy.lol")
        assert len(result["results"]) == 2
        assert result["results"][0]["email"] == "alice@gmail.com"
        assert result["domains_queried"] == 2

    def test_too_many_emails(self) -> None:
        emails = [f"user{i}@example.com" for i in range(21)]
        with pytest.raises(VrfyError, match="exceeds maximum of 20"):
            validate_batch(emails)

    def test_empty_list(self) -> None:
        with pytest.raises(VrfyError, match="Empty email list"):
            validate_batch([])
