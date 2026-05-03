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
