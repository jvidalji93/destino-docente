import argparse
import csv
from pathlib import Path

import psycopg

from app.config import get_database_url


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import schools from a local CSV file.")
    parser.add_argument("csv_path", type=Path, help="Path to the CSV file to import.")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Delete all existing schools before importing.",
    )
    return parser.parse_args()


def split_levels(value: str) -> list[str]:
    return [level.strip() for level in value.replace(";", "|").split("|") if level.strip()]


def parse_coordinate(value: str) -> float | None:
    if value is None or value.strip() == "":
        return None

    return float(value.replace(",", "."))


def map_row(row: dict[str, str], row_number: int) -> dict | None:
    latitude = parse_coordinate(row.get("latitude", ""))
    longitude = parse_coordinate(row.get("longitude", ""))

    if latitude is None or longitude is None:
        print(f"Warning: row {row_number} skipped because latitude or longitude is missing.")
        return None

    return {
        "name": row.get("name", "").strip(),
        "address": row.get("address", "").strip(),
        "municipality": row.get("municipality", "").strip(),
        "province": row.get("province", "").strip(),
        "autonomous_region": row.get("autonomous_region", "").strip(),
        "ownership": row.get("ownership", "").strip(),
        "education_levels": split_levels(row.get("education_levels", "")),
        "latitude": latitude,
        "longitude": longitude,
    }


def load_rows(csv_path: Path) -> tuple[list[dict], int]:
    schools = []
    skipped = 0

    with csv_path.open(newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.DictReader(csv_file)

        for row_number, row in enumerate(reader, start=2):
            school = map_row(row, row_number)
            if school is None:
                skipped += 1
                continue

            schools.append(school)

    return schools, skipped


def main() -> None:
    args = parse_args()
    if not args.csv_path.exists():
        raise SystemExit(f"CSV file not found: {args.csv_path}")

    schools, skipped = load_rows(args.csv_path)

    with psycopg.connect(get_database_url()) as connection:
        with connection.cursor() as cursor:
            if args.truncate:
                cursor.execute("TRUNCATE TABLE schools RESTART IDENTITY;")

            if schools:
                cursor.executemany(INSERT_SQL, schools)

    print(f"Imported {len(schools)} schools.")
    print(f"Skipped {skipped} rows.")


if __name__ == "__main__":
    main()
