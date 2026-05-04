import argparse
import csv
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT_DIR / "data" / "raw" / "andalucia" / "da_centros.csv"
DEFAULT_OUTPUT = ROOT_DIR / "data" / "processed" / "andalucia" / "andalucia_schools_normalized.csv"

OUTPUT_COLUMNS = [
    "source",
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
    "last_source_update",
]

LEVEL_RULES = [
    ("Infantil", ("inf",)),
    ("Primaria", ("pri",)),
    ("ESO", ("eso",)),
    ("Bachillerato", ("bach",)),
    ("FP", ("fp",)),
    ("Adultos", ("adul",)),
    ("Idiomas", ("idi",)),
    ("Música/Danza", ("mus", "dan")),
    ("Educación Especial", ("ee",)),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transform the official Andalusia schools CSV into the normalized project format."
    )
    parser.add_argument("--province", help="Optional province filter, for example: Almería.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Official Andalusia CSV path.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Normalized CSV output path.")
    return parser.parse_args()


def clean(value: str | None) -> str:
    return (value or "").strip()


def normalize_coordinate(value: str | None) -> str | None:
    value = clean(value).replace(",", ".")
    if not value:
        return None

    try:
        float(value)
    except ValueError:
        return None

    return value


def has_enabled_value(value: str | None) -> bool:
    return clean(value).casefold() in {"s", "si", "sí", "1", "true", "x"}


def build_name(row: dict[str, str]) -> str:
    return " ".join(
        part for part in [clean(row.get("D_DENOMINA")), clean(row.get("D_ESPECIFICA"))] if part
    )


def detect_education_levels(row: dict[str, str]) -> str:
    enabled_columns = [
        column.casefold()
        for column, value in row.items()
        if has_enabled_value(value)
    ]

    levels = []
    for level, keywords in LEVEL_RULES:
        if any(keyword in column for column in enabled_columns for keyword in keywords):
            levels.append(level)

    return "|".join(levels)


def map_row(row: dict[str, str]) -> dict[str, str] | None:
    latitude = normalize_coordinate(row.get("N_LATITUD"))
    longitude = normalize_coordinate(row.get("N_LONGITUD"))

    if latitude is None or longitude is None:
        return None

    return {
        "source": "andalucia",
        "source_id": clean(row.get("codigo")),
        "official_code": clean(row.get("codigo")),
        "name": build_name(row),
        "address": clean(row.get("D_DOMICILIO")),
        "postal_code": clean(row.get("C_POSTAL")),
        "municipality": clean(row.get("D_MUNICIPIO")),
        "province": clean(row.get("D_PROVINCIA")),
        "autonomous_region": "Andalucía",
        "ownership": clean(row.get("D_TIPO")),
        "education_levels": detect_education_levels(row),
        "latitude": latitude,
        "longitude": longitude,
        "phone": clean(row.get("N_TELEFONO")),
        "email": clean(row.get("Correo_e")),
        "website": "",
        "last_source_update": "",
    }


def transform(input_path: Path, output_path: Path, province: str | None) -> tuple[int, int, int]:
    read_count = 0
    transformed_count = 0
    skipped_count = 0
    province_filter = province.casefold() if province else None

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open(newline="", encoding="utf-8-sig") as input_file:
        reader = csv.DictReader(input_file, delimiter=";")

        with output_path.open("w", newline="", encoding="utf-8") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=OUTPUT_COLUMNS, delimiter=";")
            writer.writeheader()

            for row_number, row in enumerate(reader, start=2):
                read_count += 1

                if province_filter and clean(row.get("D_PROVINCIA")).casefold() != province_filter:
                    continue

                normalized_row = map_row(row)
                if normalized_row is None:
                    skipped_count += 1
                    print(f"Warning: row {row_number} skipped because coordinates are missing or invalid.")
                    continue

                writer.writerow(normalized_row)
                transformed_count += 1

    return read_count, transformed_count, skipped_count


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise SystemExit(f"Input CSV not found: {args.input}")

    read_count, transformed_count, skipped_count = transform(args.input, args.output, args.province)

    print("Transformation summary:")
    print(f"- registros leidos: {read_count}")
    print(f"- registros transformados: {transformed_count}")
    print(f"- registros saltados: {skipped_count}")
    print(f"- ruta del CSV generado: {args.output}")


if __name__ == "__main__":
    main()
