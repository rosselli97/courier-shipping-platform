from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time

from .config import SECRET_KEY, SESSION_MAX_AGE

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_session_token(user_id: str) -> str:
    expires = int(time.time()) + SESSION_MAX_AGE
    payload = f"{user_id}:{expires}"
    token = f"{payload}:{_sign(payload)}"
    return base64.urlsafe_b64encode(token.encode()).decode()


def read_session_token(token: str) -> str | None:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        user_id, expires, signature = raw.rsplit(":", 2)
        if not hmac.compare_digest(signature, _sign(f"{user_id}:{expires}")):
            return None
        if int(expires) < int(time.time()):
            return None
        return user_id
    except (ValueError, TypeError):
        return None
