import base64
import hashlib
import hmac
import secrets
import time


def _sign_payload(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_admin_token(secret: str, *, ttl_seconds: int = 86_400) -> str:
    expires_at = int(time.time()) + ttl_seconds
    nonce = secrets.token_urlsafe(16)
    payload = f"{expires_at}.{nonce}"
    signature = _sign_payload(payload, secret)
    raw = f"{payload}.{signature}".encode()
    return base64.urlsafe_b64encode(raw).decode()


def verify_admin_token(token: str, secret: str) -> bool:
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
    except (ValueError, UnicodeDecodeError):
        return False

    parts = decoded.split(".")
    if len(parts) != 3:
        return False

    expires_raw, nonce, signature = parts
    if not expires_raw.isdigit() or not nonce or not signature:
        return False

    if int(expires_raw) < int(time.time()):
        return False

    payload = f"{expires_raw}.{nonce}"
    expected = _sign_payload(payload, secret)
    return hmac.compare_digest(signature, expected)
