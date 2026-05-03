import psycopg
from psycopg.rows import dict_row

from app.config import get_database_url


def find_nearby_schools(lat: float, lng: float, radius_km: float) -> list[dict]:
    query = """
        WITH origin AS (
            SELECT ST_SetSRID(ST_MakePoint(%s, %s), 4326) AS geom
        )
        SELECT
            schools.id,
            schools.name,
            schools.address,
            schools.municipality,
            schools.province,
            schools.ownership,
            schools.education_levels,
            schools.latitude,
            schools.longitude,
            ROUND(
                (ST_Distance(schools.geom::geography, origin.geom::geography) / 1000.0)::numeric,
                3
            )::float AS distance_km
        FROM schools, origin
        WHERE ST_DWithin(
            schools.geom::geography,
            origin.geom::geography,
            %s
        )
        ORDER BY distance_km ASC;
    """

    radius_meters = radius_km * 1000

    with psycopg.connect(get_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (lng, lat, radius_meters))
            return list(cursor.fetchall())
