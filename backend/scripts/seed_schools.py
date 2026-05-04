import psycopg

from app.config import get_database_url


SCHOOLS = [
    {
        "source": "seed",
        "source_id": "seed-001",
        "official_code": "SEED001",
        "name": "CEIP Sol de Madrid",
        "address": "Calle de Alcala, 45",
        "postal_code": "28014",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["infantil", "primaria"],
        "latitude": 40.4193,
        "longitude": -3.6932,
        "phone": None,
        "email": None,
        "website": None,
    },
    {
        "source": "seed",
        "source_id": "seed-002",
        "official_code": "SEED002",
        "name": "IES Rio Manzanares",
        "address": "Paseo de la Virgen del Puerto, 12",
        "postal_code": "28005",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["secundaria", "bachillerato"],
        "latitude": 40.4138,
        "longitude": -3.7219,
        "phone": None,
        "email": None,
        "website": None,
    },
    {
        "source": "seed",
        "source_id": "seed-003",
        "official_code": "SEED003",
        "name": "Colegio Parque del Retiro",
        "address": "Avenida de Menendez Pelayo, 18",
        "postal_code": "28009",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "private",
        "education_levels": ["infantil", "primaria", "secundaria"],
        "latitude": 40.4167,
        "longitude": -3.6800,
        "phone": None,
        "email": None,
        "website": None,
    },
    {
        "source": "seed",
        "source_id": "seed-004",
        "official_code": "SEED004",
        "name": "Colegio Monte de El Pardo",
        "address": "Carretera de El Pardo, 7",
        "postal_code": "28048",
        "municipality": "Madrid",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "charter",
        "education_levels": ["infantil", "primaria", "secundaria"],
        "latitude": 40.5206,
        "longitude": -3.7740,
        "phone": None,
        "email": None,
        "website": None,
    },
    {
        "source": "seed",
        "source_id": "seed-005",
        "official_code": "SEED005",
        "name": "IES Sur Metropolitano",
        "address": "Calle Madrid, 20",
        "postal_code": "28901",
        "municipality": "Getafe",
        "province": "Madrid",
        "autonomous_region": "Comunidad de Madrid",
        "ownership": "public",
        "education_levels": ["secundaria", "bachillerato", "fp"],
        "latitude": 40.3083,
        "longitude": -3.7327,
        "phone": None,
        "email": None,
        "website": None,
    },
]


INSERT_SQL = """
INSERT INTO schools (
    source,
    source_id,
    official_code,
    name,
    address,
    postal_code,
    municipality,
    province,
    autonomous_region,
    ownership,
    education_levels,
    latitude,
    longitude,
    phone,
    email,
    website,
    last_source_update,
    geom
)
VALUES (
    %(source)s,
    %(source_id)s,
    %(official_code)s,
    %(name)s,
    %(address)s,
    %(postal_code)s,
    %(municipality)s,
    %(province)s,
    %(autonomous_region)s,
    %(ownership)s,
    %(education_levels)s,
    %(latitude)s,
    %(longitude)s,
    %(phone)s,
    %(email)s,
    %(website)s,
    NOW(),
    ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326)
)
ON CONFLICT (name, address) DO UPDATE SET
    source = EXCLUDED.source,
    source_id = EXCLUDED.source_id,
    official_code = EXCLUDED.official_code,
    municipality = EXCLUDED.municipality,
    province = EXCLUDED.province,
    autonomous_region = EXCLUDED.autonomous_region,
    postal_code = EXCLUDED.postal_code,
    ownership = EXCLUDED.ownership,
    education_levels = EXCLUDED.education_levels,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    website = EXCLUDED.website,
    last_source_update = EXCLUDED.last_source_update,
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
