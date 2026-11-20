"""Convert AgriPriceBD's published CSV files to the market importer contract.

Source dataset: https://data.mendeley.com/datasets/bkmxnrn3hn/1 (CC BY 4.0).
The published series is national, wholesale/retail, and limited to five crops.
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path


SOURCE_URL = "https://data.mendeley.com/datasets/bkmxnrn3hn/1"
SOURCE_NAME = "AgriPriceBD — DAM daily report digitization"


def normalize_header(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower()).strip()


def find_column(headers, aliases):
    for alias in aliases:
        if alias in headers:
            return headers[alias]
    return None


def convert(input_dir: Path):
    files = sorted(input_dir.glob("*.csv"))
    if not files:
        raise ValueError(f"No CSV files found under {input_dir}")
    output = []
    skipped = 0
    used_files = 0
    for file_path in files:
        with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                continue
            columns = {normalize_header(name): name for name in reader.fieldnames}
            date_col = find_column(columns, ["date"])
            product_col = find_column(columns, ["product name", "product", "commodity", "crop"])
            unit_col = find_column(columns, ["measurement", "unit"])
            value_columns = {
                "wholesale": (
                    find_column(columns, ["wholesale price minimum", "wholesale minimum", "wholesale min"]),
                    find_column(columns, ["wholesale price maximum", "wholesale maximum", "wholesale max"]),
                ),
                "retail": (
                    find_column(columns, ["retail price minimum", "retail minimum", "retail min"]),
                    find_column(columns, ["retail price maximum", "retail maximum", "retail max"]),
                ),
            }
            has_range_prices = any(low and high for low, high in value_columns.values())
            mid_price_col = None if has_range_prices else find_column(columns, ["price", "mid price", "retail mid price"])
            if not date_col or (not any(low and high for low, high in value_columns.values()) and not mid_price_col):
                raise ValueError(f"Unrecognized AgriPriceBD column headers in {file_path.name}: {reader.fieldnames}")
            used_files += 1
            fallback_crop = re.sub(r"[_-]+", " ", file_path.stem).strip().title()
            for row in reader:
                commodity = (row.get(product_col) if product_col else "") or fallback_crop
                observation_date = str(row.get(date_col, "")).strip()[:10]
                unit = (row.get(unit_col, "kg") if unit_col else "kg").strip().lower()
                if unit not in ("kg", "kilogram", "kilograms"):
                    skipped += 1
                    continue
                for price_type, (low_col, high_col) in value_columns.items():
                    if not low_col or not high_col:
                        continue
                    try:
                        low = float(str(row.get(low_col, "")).replace(",", "").strip())
                        high = float(str(row.get(high_col, "")).replace(",", "").strip())
                    except (TypeError, ValueError):
                        skipped += 1
                        continue
                    # Keep the source's zero/outage rows out of training and disclose the count.
                    if low <= 0 or high <= 0 or high < low:
                        skipped += 1
                        continue
                    output.append({
                        "date": observation_date,
                        "commodity": commodity.strip(),
                        "division": "National",
                        "market": "",
                        "priceType": price_type,
                        "unit": "BDT/kg",
                        "priceMin": low,
                        "priceMax": high,
                        "source": SOURCE_NAME,
                        "sourceUrl": SOURCE_URL,
                        "licence": "CC BY 4.0",
                        "qualityStatus": "review",
                    })
                if mid_price_col:
                    try:
                        mid_price = float(str(row.get(mid_price_col, "")).replace(",", "").strip())
                    except (TypeError, ValueError):
                        skipped += 1
                    else:
                        if mid_price <= 0:
                            skipped += 1
                        else:
                            output.append({
                                "date": observation_date,
                                "commodity": commodity.strip(),
                                "division": "National",
                                "market": "",
                                "priceType": "retail",
                                "unit": "BDT/kg",
                                "priceMin": mid_price,
                                "priceMax": mid_price,
                                "source": SOURCE_NAME,
                                "sourceUrl": SOURCE_URL,
                                "licence": "CC BY 4.0",
                                "qualityStatus": "review",
                            })
    if not output:
        raise ValueError("No valid market observations were found.")
    return {"observations": output, "conversion": {"filesRead": used_files, "recordsWritten": len(output), "recordsSkipped": skipped, "qualityStatus": "review"}}


def main():
    parser = argparse.ArgumentParser(description="Convert AgriPriceBD CSV files to KrishiBondhu normalized market JSON.")
    parser.add_argument("input_dir", type=Path, help="Directory containing the dataset's CSV files")
    parser.add_argument("output_json", type=Path, help="Where to write normalized market JSON")
    args = parser.parse_args()
    document = convert(args.input_dir)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"files={document['conversion']['filesRead']} rows={document['conversion']['recordsWritten']} skipped={document['conversion']['recordsSkipped']} quality=review", file=sys.stderr)


if __name__ == "__main__":
    main()
