import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


def get_database_url() -> str:
    user = quote_plus(os.getenv("POSTGRES_USER", "destino"))
    password = quote_plus(os.getenv("POSTGRES_PASSWORD", ""))
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5433")
    database = os.getenv("POSTGRES_DB", "destino_docente")

    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def get_session_cookie_name() -> str:
    return os.getenv("SESSION_COOKIE_NAME", "destino_docente_session")


def get_session_expire_days() -> int:
    raw_value = os.getenv("SESSION_EXPIRE_DAYS", "7")
    try:
        return max(1, int(raw_value))
    except ValueError:
        return 7


def get_session_cookie_secure() -> bool:
    return os.getenv("SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}


def get_session_cookie_samesite() -> str:
    value = os.getenv("SESSION_COOKIE_SAMESITE", "lax").lower()
    return value if value in {"lax", "strict", "none"} else "lax"
