import psycopg

from app.config import get_database_url


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS schools (
    id BIGSERIAL PRIMARY KEY,
    source TEXT,
    source_id TEXT,
    official_code TEXT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    postal_code TEXT,
    municipality TEXT NOT NULL,
    province TEXT NOT NULL,
    autonomous_region TEXT NOT NULL,
    ownership TEXT NOT NULL,
    education_levels TEXT[] NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    last_source_update TIMESTAMP NULL,
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, address)
);

ALTER TABLE schools ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS official_code TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS last_source_update TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_schools_geom
    ON schools
    USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_schools_source_source_id
    ON schools (source, source_id);

CREATE INDEX IF NOT EXISTS idx_schools_source_official_code
    ON schools (source, official_code);

CREATE INDEX IF NOT EXISTS idx_schools_name_location
    ON schools (name, municipality, province);

CREATE INDEX IF NOT EXISTS idx_schools_municipality
    ON schools (municipality);

CREATE INDEX IF NOT EXISTS idx_schools_province
    ON schools (province);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash
    ON user_sessions (session_token_hash);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
    ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
    ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS school_lists (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS school_list_items (
    id BIGSERIAL PRIMARY KEY,
    list_id BIGINT NOT NULL REFERENCES school_lists(id) ON DELETE CASCADE,
    school_id BIGINT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (list_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_school_lists_user_id
    ON school_lists (user_id);

CREATE INDEX IF NOT EXISTS idx_school_list_items_list_id
    ON school_list_items (list_id);

CREATE INDEX IF NOT EXISTS idx_school_list_items_school_id
    ON school_list_items (school_id);

CREATE INDEX IF NOT EXISTS idx_school_list_items_position
    ON school_list_items (list_id, position);
"""


def main() -> None:
    with psycopg.connect(get_database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(SCHEMA_SQL)

    print("Database initialized.")


if __name__ == "__main__":
    main()
