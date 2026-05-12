import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.config import get_database_url


MAIN_LIST_NAME = "Mi lista"


class SchoolListItemPayload(BaseModel):
    school_id: int
    position: int | None = None
    notes: str | None = None


class ReplaceSchoolListRequest(BaseModel):
    items: list[SchoolListItemPayload]


class PatchSchoolListItemRequest(BaseModel):
    position: int | None = None
    notes: str | None = None


def get_or_create_main_list(connection: psycopg.Connection, user_id: int) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO school_lists (user_id, name)
            VALUES (%s, %s)
            ON CONFLICT (user_id, name)
            DO UPDATE SET updated_at = school_lists.updated_at
            RETURNING id
            """,
            (user_id, MAIN_LIST_NAME),
        )
        row = cursor.fetchone()

    return row["id"]


def serialize_school_list(connection: psycopg.Connection, list_id: int) -> dict:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                name,
                created_at,
                updated_at
            FROM school_lists
            WHERE id = %s
            """,
            (list_id,),
        )
        school_list = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                school_list_items.id AS list_item_id,
                schools.id AS school_id,
                school_list_items.position,
                school_list_items.notes,
                schools.name,
                schools.address,
                schools.municipality,
                schools.province,
                schools.ownership,
                schools.education_levels,
                schools.latitude,
                schools.longitude,
                NULL::DOUBLE PRECISION AS distance_km
            FROM school_list_items
            JOIN schools ON schools.id = school_list_items.school_id
            WHERE school_list_items.list_id = %s
            ORDER BY school_list_items.position ASC, school_list_items.id ASC
            """,
            (list_id,),
        )
        items = cursor.fetchall()

    return {
        "id": school_list["id"],
        "name": school_list["name"],
        "created_at": school_list["created_at"],
        "updated_at": school_list["updated_at"],
        "items": [dict(item) for item in items],
    }


def get_main_school_list(user_id: int) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        list_id = get_or_create_main_list(connection, user_id)
        result = serialize_school_list(connection, list_id)
        connection.commit()

    return result


def replace_main_school_list(user_id: int, payload: ReplaceSchoolListRequest) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        list_id = get_or_create_main_list(connection, user_id)

        unique_items = []
        seen_school_ids = set()
        for item in payload.items:
            if item.school_id in seen_school_ids:
                continue

            seen_school_ids.add(item.school_id)
            unique_items.append(item)

        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM school_list_items WHERE list_id = %s", (list_id,))

            for index, item in enumerate(unique_items, start=1):
                cursor.execute(
                    """
                    INSERT INTO school_list_items (list_id, school_id, position, notes)
                    SELECT %s, schools.id, %s, %s
                    FROM schools
                    WHERE schools.id = %s
                    """,
                    (list_id, item.position or index, item.notes, item.school_id),
                )

            cursor.execute(
                "UPDATE school_lists SET updated_at = NOW() WHERE id = %s",
                (list_id,),
            )

        result = serialize_school_list(connection, list_id)
        connection.commit()

    return result


def add_school_list_item(user_id: int, payload: SchoolListItemPayload) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        list_id = get_or_create_main_list(connection, user_id)

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(MAX(position), 0) + 1 AS next_position
                FROM school_list_items
                WHERE list_id = %s
                """,
                (list_id,),
            )
            next_position = cursor.fetchone()["next_position"]

            cursor.execute(
                """
                INSERT INTO school_list_items (list_id, school_id, position, notes)
                SELECT %s, schools.id, %s, %s
                FROM schools
                WHERE schools.id = %s
                ON CONFLICT (list_id, school_id)
                DO NOTHING
                """,
                (list_id, payload.position or next_position, payload.notes, payload.school_id),
            )
            cursor.execute(
                "UPDATE school_lists SET updated_at = NOW() WHERE id = %s",
                (list_id,),
            )

        result = serialize_school_list(connection, list_id)
        connection.commit()

    return result


def patch_school_list_item(user_id: int, item_id: int, payload: PatchSchoolListItemRequest) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        list_id = get_or_create_main_list(connection, user_id)

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT school_list_items.id
                FROM school_list_items
                JOIN school_lists ON school_lists.id = school_list_items.list_id
                WHERE school_list_items.id = %s
                    AND school_lists.id = %s
                    AND school_lists.user_id = %s
                """,
                (item_id, list_id, user_id),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="School list item not found")

            if payload.notes is not None:
                cursor.execute(
                    """
                    UPDATE school_list_items
                    SET notes = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (payload.notes, item_id),
                )

            if payload.position is not None:
                cursor.execute(
                    """
                    UPDATE school_list_items
                    SET position = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (payload.position, item_id),
                )

            cursor.execute(
                "UPDATE school_lists SET updated_at = NOW() WHERE id = %s",
                (list_id,),
            )

        result = serialize_school_list(connection, list_id)
        connection.commit()

    return result


def delete_school_list_item(user_id: int, item_id: int) -> dict:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        list_id = get_or_create_main_list(connection, user_id)

        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM school_list_items
                USING school_lists
                WHERE school_list_items.id = %s
                    AND school_list_items.list_id = school_lists.id
                    AND school_lists.id = %s
                    AND school_lists.user_id = %s
                """,
                (item_id, list_id, user_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="School list item not found")

            cursor.execute(
                "UPDATE school_lists SET updated_at = NOW() WHERE id = %s",
                (list_id,),
            )

        result = serialize_school_list(connection, list_id)
        connection.commit()

    return result
