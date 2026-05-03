import psycopg

from app.config import get_database_url


SCHOOLS = [
    {
        "name": "CEIP Sol de Madrid",
        "address": "Calle de Alcala, 45",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["infantil", "primaria"],
        "latitude": 40.4193,
        "longitude": -3.6932,
    },
    {
        "name": "IES Rio Manzanares",
        "address": "Paseo de la Virgen del Puerto, 12",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["secundaria", "bachillerato"],
        "latitude": 40.4138,
        "longitude": -3.7219,
    },
    {
        "name": "Colegio Parque del Retiro",
        "address": "Avenida de Menendez Pelayo, 18",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "private",
        "education_levels": ["infantil", "primaria", "secundaria"],
        "latitude": 40.4167,
        "longitude": -3.6800,
    },
    {
        "name": "Colegio Monte de El Pardo",
        "address": "Carretera de El Pardo, 7",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "charter",
        "education_levels": ["infantil", "primaria", "secundaria"],
        "latitude": 40.5206,
        "longitude": -3.7740,
    },
    {
        "name": "IES Sur Metropolitano",
        "address": "Calle Madrid, 20",
        "municipality": "Getafe",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["secundaria", "bachillerato", "fp"],
        "latitude": 40.3083,
        "longitude": -3.7327,
    },
]


INSERT_SQL = """
INSERT INTO schools (
    name,
    address,
    municipality,
    province,
    autonomous_region,
    ownership,
    education_levels,
    latitude,
    longitude,
    geom
)
VALUES (
    %(name)s,
    %(address)s,
    %(municipality)s,
    %(province)s,
    %(autonomous_region)s,
    %(ownership)s,
    %(education_levels)s,
    %(latitude)s,
    %(longitude)s,
    ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326)
)
ON CONFLICT (name, address) DO UPDATE SET
    municipality = EXCLUDED.municipality,
    province = EXCLUDED.province,
    autonomous_region = EXCLUDED.autonomous_region,
    ownership = EXCLUDED.ownership,
    education_levels = EXCLUDED.education_levels,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    geom = EXCLUDED.geom,
    updated_at = NOW();
"""


def main() -> None:
    with psycopg.connect(get_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(INSERT_SQL, SCHOOLS)

    print(f"Seeded {len(SCHOOLS)} schools.")


if __name__ == "__main__":
    main()
