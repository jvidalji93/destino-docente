import psycopg

from app.config import get_database_url


def check_database_connection() -> bool:
    with psycopg.connect(get_database_url(), connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone() == (1,)
