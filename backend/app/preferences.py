import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from app.config import get_database_url


class UserPreferencesPayload(BaseModel):
    search_preferences: dict | None = None
    default_location: dict | None = None


def serialize_preferences(row: dict | None) -> dict:
    if not row:
        return {
            "search_preferences": None,
            "default_location": None,
        }

    return {
        "search_preferences": row["search_preferences_json"],
        "default_location": row["default_location_json"],
    }


def get_user_preferences(user_id: int) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT search_preferences_json, default_location_json
                FROM user_preferences
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cursor.fetchone()

    return serialize_preferences(row)


def update_user_preferences(user_id: int, payload: UserPreferencesPayload) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT search_preferences_json, default_location_json
                FROM user_preferences
                WHERE user_id = %s
                """,
                (user_id,),
            )
            current = cursor.fetchone()
            fields_set = payload.model_fields_set
            search_preferences = (
                payload.search_preferences
                if "search_preferences" in fields_set
                else current["search_preferences_json"]
                if current
                else None
            )
            default_location = (
                payload.default_location
                if "default_location" in fields_set
                else current["default_location_json"]
                if current
                else None
            )

            cursor.execute(
                """
                INSERT INTO user_preferences (
                    user_id,
                    search_preferences_json,
                    default_location_json
                )
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    search_preferences_json = EXCLUDED.search_preferences_json,
                    default_location_json = EXCLUDED.default_location_json,
                    updated_at = NOW()
                RETURNING search_preferences_json, default_location_json
                """,
                (
                    user_id,
                    Jsonb(search_preferences) if search_preferences is not None else None,
                    Jsonb(default_location) if default_location is not None else None,
                ),
            )
            row = cursor.fetchone()

        connection.commit()

    return serialize_preferences(row)
