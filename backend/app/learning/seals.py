"""HMAC seals for MCQ correct options. Never return plaintext keys to clients."""
from __future__ import annotations

import hashlib
import hmac


def seal_option(secret: str, question_id: str, option_id: str) -> str:
    msg = f"{question_id}:{option_id}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def verify_option(secret: str, question_id: str, option_id: str, seal: str) -> bool:
    expected = seal_option(secret, question_id, option_id)
    return hmac.compare_digest(expected, seal)
