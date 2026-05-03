import psycopg

from app.config import get_database_url


def check_postgis_connection() -> str:
    with psycopg.connect(get_database_url(), connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT PostGIS_Version()")
            row = cursor.fetchone()

    if row is None or row[0] is None:
        raise RuntimeError("PostGIS is not available")

    return row[0]
