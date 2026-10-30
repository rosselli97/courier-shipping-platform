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

TOPUP_PACKAGES = (50, 100, 250, 500)
