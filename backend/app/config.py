import os

SECRET_KEY = os.getenv("MUVPACK_SECRET_KEY", "dev-secret-change-me")
SESSION_COOKIE = "muvpack_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7

DATABASE_URL = os.getenv("MUVPACK_DATABASE_URL", "sqlite:///./muvpack.db")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@muvpack.it")

COOKIE_SECURE = os.getenv("MUVPACK_COOKIE_SECURE", "0") == "1"
SESSION_SAMESITE = os.getenv("MUVPACK_SESSION_SAMESITE", "lax").lower()
if SESSION_SAMESITE not in ("lax", "strict", "none"):
    SESSION_SAMESITE = "lax"

CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https://([a-z0-9-]+\.)*onrender\.com|https://([a-z0-9-]+\.)*vercel\.app|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?",
)

TOPUP_PACKAGES = (50, 100, 250, 500)
