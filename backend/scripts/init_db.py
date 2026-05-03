import psycopg

from app.config import get_database_url


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS schools (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    municipality TEXT NOT NULL,
    province TEXT NOT NULL,
    autonomous_region TEXT NOT NULL,
    ownership TEXT NOT NULL,
    education_levels TEXT[] NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, address)
);

CREATE INDEX IF NOT EXISTS idx_schools_geom
    ON schools
    USING GIST (geom);
"""


def main() -> None:
    with psycopg.connect(get_database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(SCHEMA_SQL)

    print("Database initialized.")


if __name__ == "__main__":
    main()
