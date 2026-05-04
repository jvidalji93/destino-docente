import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

import psycopg

from app.config import get_database_url


EXPECTED_COLUMNS = [
    "source_id",
    "official_code",
    "name",
    "address",
    "postal_code",
    "municipality",
    "province",
    "autonomous_region",
    "ownership",
    "education_levels",
    "latitude",
    "longitude",
    "phone",
    "email",
    "website",
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
);
"""

UPDATE_SQL = """
UPDATE schools
SET
    source = %(source)s,
    source_id = %(source_id)s,
    official_code = %(official_code)s,
    name = %(name)s,
    address = %(address)s,
    postal_code = %(postal_code)s,
    municipality = %(municipality)s,
    province = %(province)s,
    autonomous_region = %(autonomous_region)s,
    ownership = %(ownership)s,
    education_levels = %(education_levels)s,
    latitude = %(latitude)s,
    longitude = %(longitude)s,
    phone = %(phone)s,
    email = %(email)s,
    website = %(website)s,
    last_source_update = NOW(),
    geom = ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326),
    updated_at = NOW()
WHERE id = %(id)s;
"""


@dataclass
class ImportSummary:
    read: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import schools from a local CSV file.")
    parser.add_argument("csv_path", type=Path, help="Path to the CSV file to import.")
    parser.add_argument("--source", default="csv", help="Source name, for example: andalucia.")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV encoding.")
    parser.add_argument("--delimiter", default=";", help="CSV delimiter.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without inserting or updating rows.")
    return parser.parse_args()


def clean(value: str | None) -> str:
    return (value or "").strip()


def optional(value: str | None) -> str | None:
    value = clean(value)
    return value or None


def split_levels(value: str | None) -> list[str]:
    return [level.strip() for level in clean(value).replace(";", "|").split("|") if level.strip()]


def parse_coordinate(value: str | None) -> float | None:
    value = clean(value)
    if not value:
        return None

    return float(value.replace(",", "."))


def check_headers(fieldnames: list[str] | None) -> None:
    if fieldnames is None:
        raise SystemExit("CSV file has no header row.")

    missing_columns = [column for column in EXPECTED_COLUMNS if column not in fieldnames]
    if missing_columns:
        raise SystemExit(f"Missing CSV columns: {', '.join(missing_columns)}")


def map_row(row: dict[str, str], row_number: int, source: str) -> dict | None:
    try:
        latitude = parse_coordinate(row.get("latitude"))
        longitude = parse_coordinate(row.get("longitude"))
    except ValueError:
        print(f"Warning: row {row_number} skipped because latitude or longitude is invalid.")
        return None

    if latitude is None or longitude is None:
        print(f"Warning: row {row_number} skipped because latitude or longitude is missing.")
        return None

    return {
        "source": source,
        "source_id": optional(row.get("source_id")),
        "official_code": optional(row.get("official_code")),
        "name": clean(row.get("name")),
        "address": clean(row.get("address")),
        "postal_code": optional(row.get("postal_code")),
        "municipality": clean(row.get("municipality")),
        "province": clean(row.get("province")),
        "autonomous_region": clean(row.get("autonomous_region")),
        "ownership": clean(row.get("ownership")),
        "education_levels": split_levels(row.get("education_levels")),
        "latitude": latitude,
        "longitude": longitude,
        "phone": optional(row.get("phone")),
        "email": optional(row.get("email")),
        "website": optional(row.get("website")),
    }


def find_existing_school_id(cursor: psycopg.Cursor, school: dict) -> int | None:
    if school["source"] and school["source_id"]:
        cursor.execute(
            "SELECT id FROM schools WHERE source = %s AND source_id = %s LIMIT 1",
            (school["source"], school["source_id"]),
        )
        row = cursor.fetchone()
        if row:
            return row[0]

    if school["source"] and school["official_code"]:
        cursor.execute(
            "SELECT id FROM schools WHERE source = %s AND official_code = %s LIMIT 1",
            (school["source"], school["official_code"]),
        )
        row = cursor.fetchone()
        if row:
            return row[0]

    cursor.execute(
        """
        SELECT id
        FROM schools
        WHERE name = %s AND municipality = %s AND province = %s
        LIMIT 1
        """,
        (school["name"], school["municipality"], school["province"]),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def import_csv(args: argparse.Namespace) -> ImportSummary:
    summary = ImportSummary()

    with args.csv_path.open(newline="", encoding=args.encoding) as csv_file:
        reader = csv.DictReader(csv_file, delimiter=args.delimiter)
        check_headers(reader.fieldnames)

        with psycopg.connect(get_database_url(), autocommit=True) as connection:
            with connection.cursor() as cursor:
                for row_number, row in enumerate(reader, start=2):
                    summary.read += 1
                    school = map_row(row, row_number, args.source)
                    if school is None:
                        summary.skipped += 1
                        continue

                    try:
                        existing_id = find_existing_school_id(cursor, school)
                        if args.dry_run:
                            if existing_id:
                                summary.updated += 1
                            else:
                                summary.inserted += 1
                            continue

                        if existing_id:
                            cursor.execute(UPDATE_SQL, {**school, "id": existing_id})
                            summary.updated += 1
                        else:
                            cursor.execute(INSERT_SQL, school)
                            summary.inserted += 1
                    except Exception as exc:
                        summary.errors += 1
                        print(f"Error: row {row_number} failed: {exc}")

    return summary


def print_summary(summary: ImportSummary, dry_run: bool) -> None:
    if dry_run:
        print("Dry run completed. No rows were inserted or updated.")

    print("Import summary:")
    print(f"- registros leidos: {summary.read}")
    print(f"- insertados: {summary.inserted}")
    print(f"- actualizados: {summary.updated}")
    print(f"- saltados: {summary.skipped}")
    print(f"- errores: {summary.errors}")


def main() -> None:
    args = parse_args()
    if not args.csv_path.exists():
        raise SystemExit(f"CSV file not found: {args.csv_path}")

    summary = import_csv(args)
    print_summary(summary, args.dry_run)


if __name__ == "__main__":
    main()
