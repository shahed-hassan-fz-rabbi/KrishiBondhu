"""Normalize the local Bangladesh market-price source archives.

Source values are kept apart by provenance, frequency, price type, unit, and
quality status. This pipeline never upgrades an unverified source to verified.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import gzip
import io
import json
import re
import zipfile
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import numpy as np
import pandas as pd


WB_ARCHIVE_PATTERN = re.compile(r"^BGD_RTFP_mkt_2007_(\d{4}-\d{2}-\d{2})\.zip$")
WB_URL = "https://microdata.worldbank.org/catalog/6164/study-description"
WB_SOURCE = "World Bank Real Time Food Prices (RTFP)"
RESEARCH_SOURCE = "Crop Price Prediction Dataset, IEEE TENSYMP 2024"
RESEARCH_URL = "https://doi.org/10.1109/TENSYMP61132.2024.10752263"
REPO_SOURCE = "Agricultural Commodity Price Forecasting in Bangladesh dataset"
REPO_URL = "https://github.com/RummanShahriar/Agricultural-Commodity-Price-Forecasting-in-Bangladesh"
AGRIPRICE_SOURCE = "AgriPriceBD: Daily Bangladesh market price digitization"
AGRIPRICE_URL = "https://data.mendeley.com/datasets/bkmxnrn3hn/1"
SOURCE_METADATA = {
    "agripricebd_daily": {"source": AGRIPRICE_SOURCE, "sourceUrl": AGRIPRICE_URL, "licence": "CC BY 4.0; cite dataset DOI"},
    "dam_research_repo": {"source": REPO_SOURCE, "sourceUrl": REPO_URL, "licence": "Repository MIT licence; dataset provenance/redistribution terms unverified"},
    "ieee_tensymp2024": {"source": RESEARCH_SOURCE, "sourceUrl": RESEARCH_URL, "licence": "Academic and non-commercial research only; cite IEEE TENSYMP 2024"},
    "worldbank_rtfp": {"source": WB_SOURCE, "sourceUrl": WB_URL, "licence": "World Bank open data; cite Andrée (2021)"},
    "bd_price_trend_unverified": {"source": "Undocumented Bangladesh price trend archive", "sourceUrl": None, "licence": "Source and reuse terms undocumented"},
}

MONTHS = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}
BN_NAMES = {
    "lentils": "মসুর ডাল", "oil": "তেল", "rice (coarse)": "মোটা চাল",
    "wheat flour": "আটা", "onion (local)": "দেশি পেঁয়াজ", "tomato": "টমেটো",
    "green chili": "কাঁচা মরিচ", "onion": "পেঁয়াজ", "potato": "আলু",
    "egg farm-red": "ফার্মের লাল ডিম", "egg duck-local": "হাঁসের ডিম",
    "gram (broken)": "ছোলার ডাল",
}
DIVISION_NAMES = {
    "barisal": "Barishal", "chattagram": "Chattogram", "chittagong": "Chattogram",
    "comilla": "Cumilla", "bogra": "Bogura",
}


def slug(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def text(value: Any) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    return str(value).strip()


def number(value: Any) -> float | None:
    try:
        result = float(text(value).replace(",", ""))
        return result if np.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def price_range(value: Any) -> tuple[float, float] | None:
    raw = text(value).replace("–", "--").replace("—", "--")
    pieces = re.split(r"\s*(?:--|\bto\b)\s*", raw, maxsplit=1, flags=re.I)
    if len(pieces) == 1:
        single = number(pieces[0])
        return (single, single) if single is not None else None
    low, high = number(pieces[0]), number(pieces[1])
    if low is None or high is None or low <= 0 or high <= 0 or high < low:
        return None
    return low, high


def parse_week_date(year: Any, month: Any, week: Any) -> date | None:
    try:
        y, m, w = int(text(year)), MONTHS[text(month).lower()], int(text(week))
        if not 1 <= w <= 5:
            return None
        last_day = calendar.monthrange(y, m)[1]
        # The source reports only a week-of-month, not an exact day. Keep the
        # first date in that week bucket and disclose its coarse precision.
        return date(y, m, min(1 + 7 * (w - 1), last_day))
    except (ValueError, KeyError, TypeError):
        return None


def _xlsx_rows(raw: bytes) -> list[list[str]]:
    """Read a mislabeled XLSX export using only the standard library."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(raw)) as book:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared = ["".join(node.text or "" for node in entry.findall(".//m:t", ns)) for entry in root.findall("m:si", ns)]
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//m:sheetData/m:row", ns):
            values: dict[int, str] = {}
            max_column = 0
            for cell in row.findall("m:c", ns):
                ref = cell.get("r", "A1")
                letters = re.match(r"[A-Z]+", ref)
                if not letters:
                    continue
                column = 0
                for char in letters.group(0):
                    column = column * 26 + ord(char) - ord("A") + 1
                raw_value = cell.find("m:v", ns)
                value = "" if raw_value is None else raw_value.text or ""
                if cell.get("t") == "s" and value:
                    value = shared[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(node.text or "" for node in cell.findall(".//m:t", ns))
                values[column - 1] = value
                max_column = max(max_column, column)
            rows.append([values.get(index, "") for index in range(max_column)])
        return rows


def table_rows(raw: bytes) -> list[list[str]]:
    if raw.startswith(b"PK\x03\x04"):
        return _xlsx_rows(raw)
    for encoding in ("utf-8-sig", "cp1252", "latin1"):
        try:
            return list(csv.reader(io.StringIO(raw.decode(encoding))))
        except UnicodeDecodeError:
            pass
    raise ValueError("Could not decode source table")


def _base_record(*, observed_on: date, crop: str, category: str, division: str,
                 district: str, upazila: str, market: str, price_type: str,
                 price_min: float, price_max: float, average: float | None,
                 unit: str, original_unit: str, original_min: float,
                 original_max: float, source_code: str, source: str,
                 source_url: str, licence: str, quality: str,
                 frequency: str, period_label: str, quality_status: str = "review",
                 trust_score: float | None = None,
                 spatially_interpolated: str = "", source_version: str = "") -> dict[str, Any]:
    name = crop.strip()
    key = name.lower()
    return {
        "date": observed_on.isoformat(), "crop_id": slug(name), "crop_name_en": name,
        "crop_name_bn": BN_NAMES.get(key, ""), "category": category.strip(),
        "division": division.strip(), "district": district.strip(), "upazila": upazila.strip(),
        "market": market.strip(), "price_type": price_type,
        "minimum_price": round(float(price_min), 6), "maximum_price": round(float(price_max), 6),
        "average_price": round(float(average if average is not None else (price_min + price_max) / 2), 6),
        "unit": unit, "currency": "BDT", "source": source, "source_url": source_url,
        "licence": licence, "data_quality": quality, "quality_status": quality_status,
        "frequency": frequency,
        "date_precision": "month" if frequency == "monthly" else "day" if frequency == "daily" else "week_of_month",
        "source_period": period_label, "original_minimum_price": round(float(original_min), 6),
        "original_maximum_price": round(float(original_max), 6), "original_unit": original_unit,
        "trust_score": trust_score, "spatially_interpolated": spatially_interpolated,
        "source_code": source_code, "source_version": source_version,
    }


def _append_weekly_series(records: list[dict[str, Any]], audit: dict[str, Any],
                          name: str, rows: list[list[str]]) -> None:
    if not rows:
        audit["filesRead"] += 1
        return
    audit["filesRead"] += 1
    header = [text(item) for item in rows[0]]
    # This source repeats the "Measurement" column name, so parse by position.
    if len(header) < 8:
        audit["filesRejected"] += 1
        return
    exact_seen: set[tuple[str, ...]] = set()
    for values in rows[1:]:
        audit["rowsRead"] += 1
        row = tuple(text(value) for value in values)
        if not any(row):
            audit["blankRowsSkipped"] += 1
            continue
        if row in exact_seen:
            audit["exactDuplicatesRemoved"] += 1
            continue
        exact_seen.add(row)
        if len(row) < 8:
            audit["invalidRowsSkipped"] += 1
            continue
        year, month, week, crop = row[:4]
        observed = parse_week_date(year, month, week)
        if not observed:
            audit["invalidRowsSkipped"] += 1
            continue
        # Columns 4/6 are the two separately repeated source "Measurement" fields.
        for price_type, source_unit, raw_range in (
            ("retail", row[4], row[5]), ("wholesale", row[6], row[7]),
        ):
            parsed = price_range(raw_range)
            if parsed is None:
                audit["invalidPricesSkipped"] += 1
                continue
            original_low, original_high = parsed
            unit_clean = re.sub(r"\s+", " ", source_unit).strip().lower()
            if unit_clean in {"kg", "kilogram", "kilograms"}:
                unit, factor = "BDT/kg", 1.0
            elif unit_clean in {"quintal", "quintals"}:
                unit, factor = "BDT/kg", 0.01
            elif unit_clean:
                unit, factor = f"BDT/{unit_clean}", 1.0
            else:
                audit["invalidPricesSkipped"] += 1
                continue
            records.append(_base_record(
                observed_on=observed, crop=crop, category="", division="Unspecified",
                district="", upazila="", market="", price_type=price_type,
                price_min=original_low * factor, price_max=original_high * factor,
                average=(original_low + original_high) * factor / 2,
                unit=unit, original_unit=source_unit, original_min=original_low,
                original_max=original_high, source_code="dam_research_repo",
                source=REPO_SOURCE, source_url=REPO_URL,
                licence="Repository MIT licence; dataset provenance/redistribution terms unverified",
                quality="weekly series; repository README claims DAM wholesale source; exact source file and location are absent; review required",
                frequency="weekly", period_label=f"{year}-{int(MONTHS[month.lower()]):02d}-W{int(week):02d}",
            ))
            audit["rowsOutput"] += 1


def _append_agripricebd_daily(records: list[dict[str, Any]], audit: dict[str, Any],
                              archive_path: Path) -> None:
    """Normalize AgriPriceBD daily range observations from its five CSV files."""
    audit["archivePresent"] = True
    with zipfile.ZipFile(archive_path) as archive:
        members = sorted(name for name in archive.namelist() if name.lower().endswith(".csv"))
        for member in members:
            audit["filesRead"] += 1
            raw = archive.read(member)
            content = raw.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                if not any(text(value) for value in row.values()):
                    audit["blankRowsSkipped"] += 1
                    continue
                audit["rowsRead"] += 1
                try:
                    observed = date.fromisoformat(text(row.get("date"))[:10])
                except ValueError:
                    audit["invalidRowsSkipped"] += 1
                    continue
                raw_crop = text(row.get("product name")) or Path(member).parent.name
                crop_key = raw_crop.lower().replace("_", " ").strip()
                crop = {
                    "garlic local": "Garlic", "garlic": "Garlic",
                    "green chili": "Green chilli", "green chilli": "Green chilli",
                    "sweet pumpkin": "Sweet pumpkin", "chickpea": "Chickpea",
                    "cucumber": "Cucumber",
                }.get(crop_key, raw_crop.title())
                if text(row.get("measurement")).lower() not in {"kg", "kilogram", "kilograms"}:
                    audit["invalidPricesSkipped"] += 2
                    continue
                for price_type in ("wholesale", "retail"):
                    prefix = f"{price_type} price"
                    low = number(row.get(f"{prefix} minimum"))
                    high = number(row.get(f"{prefix} maximum"))
                    if low is None or high is None or low <= 0 or high < low:
                        audit["invalidPricesSkipped"] += 1
                        continue
                    records.append(_base_record(
                        observed_on=observed, crop=crop, category="Agricultural commodity",
                        division="National", district="", upazila="", market="",
                        price_type=price_type, price_min=low, price_max=high,
                        average=(low + high) / 2, unit="BDT/kg", original_unit="kg",
                        original_min=low, original_max=high,
                        source_code="agripricebd_daily", source=AGRIPRICE_SOURCE,
                        source_url=AGRIPRICE_URL, licence="CC BY 4.0; cite the AgriPriceBD dataset",
                        quality=("Daily min/max values digitized from DAM monitoring PDFs via an LLM-assisted pipeline; "
                                 "market identifiers are absent from this archive; four known green-chilli outage rows are zero-valued."),
                        frequency="daily", period_label=observed.isoformat(), quality_status="review",
                    ))
                    audit["rowsOutput"] += 1
    audit["sourceRows"] = audit["rowsRead"]


def _append_unverified_trend(records: list[dict[str, Any]], audit: dict[str, Any],
                             archive_path: Path) -> None:
    """Retain the small trend sample for audit without treating it as verified price data."""
    audit["archivePresent"] = True
    with zipfile.ZipFile(archive_path) as archive:
        member = next((name for name in archive.namelist() if name.lower().endswith("bd_pricetrend.csv") or name.lower().endswith("bd_price_trend.csv")), None)
        if not member:
            audit["filesRejected"] += 1
            return
        audit["filesRead"] += 1
        for row in csv.DictReader(io.StringIO(archive.read(member).decode("utf-8-sig"))):
            audit["rowsRead"] += 1
            try:
                observed = date.fromisoformat(text(row.get("Date"))[:10])
                price = number(row.get("Price_Tk_per_kg"))
            except ValueError:
                observed, price = None, None
            if not observed or price is None or price <= 0 or not text(row.get("Vegetable")):
                audit["invalidRowsSkipped"] += 1
                continue
            records.append(_base_record(
                observed_on=observed, crop=text(row["Vegetable"]), category="Unverified crop price trend",
                division="Unspecified", district="", upazila="", market="",
                price_type="unspecified", price_min=price, price_max=price, average=price,
                unit="BDT/kg", original_unit="BDT/kg", original_min=price, original_max=price,
                source_code="bd_price_trend_unverified", source="BD_Price_Trend.csv (source undocumented)",
                source_url="", licence="Not supplied", quality="No source, collection method, location, or price type documentation; retained for review only.",
                frequency="daily", period_label=observed.isoformat(), quality_status="review",
            ))
            audit["rowsOutput"] += 1


def _append_reference_prices(records: list[dict[str, Any]], audit: dict[str, Any],
                             archive_path: Path) -> str:
    match = WB_ARCHIVE_PATTERN.match(archive_path.name)
    if not match:
        raise ValueError(f"Unsupported World Bank archive filename: {archive_path.name}")
    dataset_version = match.group(1)
    with zipfile.ZipFile(archive_path) as archive:
        member = next((item for item in archive.namelist() if Path(item).name == f"BGD_RTFP_mkt_2007_{dataset_version}.csv"), None)
        if not member:
            raise ValueError(f"World Bank CSV {WB_MEMBER} not found in {archive_path}")
        with archive.open(member) as stream:
            frame = pd.read_csv(stream, dtype=str, keep_default_na=False)
    audit["filesRead"] += 1
    audit["rowsRead"] = len(frame)
    commodity_units = {"lentils": ("Lentils (masur)", "Pulse", "BDT/kg"),
                       "oil": ("Oil (palm)", "Edible oil", "BDT/L"),
                       "rice": ("Rice (coarse)", "Cereal", "BDT/kg"),
                       "wheat_flour": ("Wheat flour", "Cereal", "BDT/kg")}
    divisions = frame["adm1_name"].map(lambda value: DIVISION_NAMES.get(text(value).lower(), text(value)))
    for _, row in frame.iterrows():
        try:
            observed = date.fromisoformat(text(row["price_date"])[:10])
        except ValueError:
            audit["invalidRowsSkipped"] += 1
            continue
        is_national = text(row["adm1_name"]).lower() == "market average"
        division = "National" if is_national else text(divisions.loc[row.name])
        district = "National" if is_national else text(row.get("adm2_name", ""))
        market = "Market Average" if is_national else text(row.get("mkt_name", ""))
        for ticker, (crop, category, unit) in commodity_units.items():
            avg = number(row.get(f"c_{ticker}"))
            if avg is None or avg <= 0:
                audit["invalidPricesSkipped"] += 1
                continue
            low, high = number(row.get(f"l_{ticker}")), number(row.get(f"h_{ticker}"))
            if low is not None and low <= 0: low = None
            if high is not None and high <= 0: high = None
            if low is not None and high is not None and high < low:
                audit["invalidPricesSkipped"] += 1
                continue
            trust = number(row.get(f"trust_{ticker}"))
            records.append(_base_record(
                observed_on=observed, crop=crop, category=category,
                division=division, district=district, upazila="", market=market,
                price_type="reference_estimate", price_min=low if low is not None else avg,
                price_max=high if high is not None else avg, average=avg, unit=unit,
                original_unit="KG" if unit == "BDT/kg" else "L",
                original_min=low if low is not None else avg,
                original_max=high if high is not None else avg,
                source_code="worldbank_rtfp", source=WB_SOURCE, source_url=WB_URL,
                licence=f"World Bank open data; cite Andrée (2021), dataset version {dataset_version}",
                quality=(f"World Bank modeled monthly estimate; trust={trust if trust is not None else 'missing'}/10; "
                         f"spatially_interpolated={text(row.get('spatially_interpolated', ''))}; "
                         f"data_coverage={text(row.get('data_coverage', ''))}; price type not classified as retail/wholesale"),
                frequency="monthly", period_label=observed.strftime("%Y-%m"),
                quality_status="verified_source_estimate", trust_score=trust,
                spatially_interpolated=text(row.get("spatially_interpolated", "")),
                source_version=dataset_version,
            ))
            audit["rowsOutput"] += 1
    audit["datasetVersion"] = dataset_version
    return dataset_version


def _append_weekly_market_table(records: list[dict[str, Any]], audit: dict[str, Any],
                                rows: list[dict[str, str]]) -> None:
    audit["filesRead"] += 1
    exact_seen: set[tuple[tuple[str, str], ...]] = set()
    for row in rows:
        audit["rowsRead"] += 1
        signature = tuple(sorted((str(k), text(v)) for k, v in row.items()))
        if signature in exact_seen:
            audit["exactDuplicatesRemoved"] += 1
            continue
        exact_seen.add(signature)
        observed = parse_week_date(row.get("Year"), row.get("Month"), row.get("Week"))
        crop = text(row.get("Commodity Name"))
        if not observed or not crop:
            audit["invalidRowsSkipped"] += 1
            continue
        division = text(row.get("Division"))
        division = DIVISION_NAMES.get(division.lower(), division)
        district = DIVISION_NAMES.get(text(row.get("District")).lower(), text(row.get("District")))
        category = text(row.get("Commodity Group"))
        for price_type, unit_key, range_key, avg_key in (
            ("retail", "Retail Unit", "Retail Price", "R Average Price"),
            ("wholesale", "Whole Sale Unit", "Wholesale price", "W Average Price"),
        ):
            parsed = price_range(row.get(range_key))
            if parsed is None:
                audit["invalidPricesSkipped"] += 1
                continue
            original_low, original_high = parsed
            original_unit = text(row.get(unit_key))
            if original_unit.lower() in {"kg", "kilogram", "kilograms"}:
                unit, factor = "BDT/kg", 1.0
            elif original_unit.lower() in {"quintal", "quintals"}:
                unit, factor = "BDT/kg", 0.01
            else:
                audit["invalidPricesSkipped"] += 1
                continue
            average = number(row.get(avg_key))
            if average is not None:
                average *= factor
            records.append(_base_record(
                observed_on=observed, crop=crop, category=category, division=division,
                district=district, upazila=text(row.get("Upazila")), market=text(row.get("Market Name")),
                price_type=price_type, price_min=original_low * factor, price_max=original_high * factor,
                average=average, unit=unit, original_unit=original_unit,
                original_min=original_low, original_max=original_high,
                source_code="ieee_tensymp2024", source=RESEARCH_SOURCE,
                source_url=RESEARCH_URL,
                licence="Academic and non-commercial research only; cite IEEE TENSYMP 2024",
                quality="location-level weekly data; 50 exact duplicate source rows removed; source collection method needs paper review",
                frequency="weekly", period_label=f"{text(row.get('Year'))}-{int(MONTHS[text(row.get('Month')).lower()]):02d}-W{int(text(row.get('Week'))):02d}",
            ))
            audit["rowsOutput"] += 1


def _audit_frame(frame: pd.DataFrame, raw_source_stats: dict[str, dict[str, Any]],
                 excluded: dict[str, Any], output_path: Path) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for code, group in frame.groupby("source_code", sort=True):
        dates = pd.to_datetime(group["date"], errors="coerce")
        metrics[code] = {
            **SOURCE_METADATA.get(code, {}), **raw_source_stats.get(code, {}),
            "normalizedRows": int(len(group)),
            "uniqueCrops": int(group["crop_name_en"].nunique()),
            "crops": {str(k): int(v) for k, v in group.groupby("crop_name_en").size().sort_index().items()},
            "priceTypes": sorted(group["price_type"].unique().tolist()),
            "units": sorted(group["unit"].unique().tolist()),
            "divisions": sorted(group["division"].dropna().unique().tolist()),
            "districts": int(group["district"].replace("", np.nan).nunique()),
            "markets": int(group["market"].replace("", np.nan).nunique()),
            "dateStart": dates.min().date().isoformat(),
            "dateEnd": dates.max().date().isoformat(),
            "frequency": sorted(group["frequency"].unique().tolist()),
            "qualityStatus": sorted(group["quality_status"].unique().tolist()),
        }
    report = {
        "generatedBy": "krishi_server/science/market_data_pipeline.py",
        "recordsWritten": int(len(frame)),
        "uniqueCrops": int(frame["crop_name_en"].nunique()),
        "sources": metrics,
        "excludedSources": excluded,
        "expectedButNotReceived": [],
        "limitations": [
            "World Bank RTFP rows are modeled monthly reference estimates, not today's observed DAM retail, wholesale, or producer quotes.",
            "The IEEE TENSYMP dataset PDF limits use to academic and non-commercial research; do not ship its records in a commercial product without permission.",
            "The six-series repository README attributes values to DAM, but those files have no market/location columns and their direct source records were not supplied; they remain review-only.",
            "BD_Price_Trend.csv has 50 Tk/kg values but no documented source URL, locality, price type, or collection method; it is retained as review-only and excluded from training and actual-price display.",
            "Week-of-month inputs do not identify exact report dates; normalized week dates are bucket representatives, not day-level observations.",
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _write_worldbank_reference_history(frame: pd.DataFrame, output_dir: Path, dataset_version: str) -> dict[str, Any]:
    wb = frame.loc[frame["source_code"].eq("worldbank_rtfp")].copy()
    if wb.empty:
        return {"file": None, "seriesPoints": 0}
    wb["trust_score"] = pd.to_numeric(wb["trust_score"], errors="coerce")
    wb["spatially_interpolated"] = wb["spatially_interpolated"].astype(str).str.strip().eq("1")
    keys = ["crop_id", "crop_name_en", "crop_name_bn", "division", "unit", "date"]
    points: list[dict[str, Any]] = []
    for identity, group in wb.groupby(keys, dropna=False, sort=True):
        crop_id, crop_en, crop_bn, division, unit, observed_on = identity
        points.append({
            "date": str(observed_on), "cropId": str(crop_id), "cropNameEn": str(crop_en),
            "cropNameBn": str(crop_bn), "division": str(division), "priceType": "reference_estimate",
            "frequency": "monthly", "unit": str(unit),
            "price": round(float(group["average_price"].median()), 4),
            "priceLow": round(float(group["minimum_price"].median()), 4),
            "priceHigh": round(float(group["maximum_price"].median()), 4),
            "trustScoreMedian": round(float(group["trust_score"].median()), 2) if group["trust_score"].notna().any() else None,
            "marketEstimateCount": int(group["market"].replace("", np.nan).nunique()),
            "spatialInterpolationShare": round(float(group["spatially_interpolated"].mean()), 4),
            "aggregation": "official national market average" if division == "National" else "unweighted median of available market estimates in this division",
        })
    points.sort(key=lambda row: (row["cropId"], row["division"], row["date"]))
    document = {
        "source": WB_SOURCE, "sourceUrl": WB_URL,
        "datasetId": "BGD_2021_RTFP_v02_M", "datasetVersion": dataset_version,
        "updatedAt": dataset_version, "frequency": "monthly",
        "priceType": "reference_estimate", "currency": "BDT",
        "limitations": "Modeled estimates with source coverage, trust and spatial interpolation differences. This is not a live DAM quote or specifically retail/wholesale price.",
        "points": points,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "worldbank_reference_history.json.gz"
    with out_path.open("wb") as raw_stream:
        with gzip.GzipFile(fileobj=raw_stream, mode="wb", mtime=0) as compressed:
            compressed.write(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    return {"file": str(out_path), "seriesPoints": len(points)}


def build_dataset(raw_dir: Path, output_dir: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    records: list[dict[str, Any]] = []
    raw_stats: dict[str, dict[str, Any]] = {}
    raw_dir = raw_dir.resolve()

    agriprice_zip = raw_dir / "agripricebd-daily.zip"
    daily_audit = Counter()
    if agriprice_zip.exists():
        _append_agripricebd_daily(records, daily_audit, agriprice_zip)
        raw_stats["agripricebd_daily"] = dict(daily_audit)
    else:
        raw_stats["agripricebd_daily"] = {"archivePresent": False}

    agri_zip = raw_dir / "Agricultural-Commodity-Price-Forecasting-in-Bangladesh-main.zip"
    agri_audit = Counter()
    if agri_zip.exists():
        with zipfile.ZipFile(agri_zip) as archive:
            for member in archive.namelist():
                if "/Dataset/" not in member or not member.lower().endswith(".csv"):
                    continue
                rows = table_rows(archive.read(member))
                _append_weekly_series(records, agri_audit, Path(member).name, rows)
        raw_stats["dam_research_repo"] = dict(agri_audit)
    else:
        raw_stats["dam_research_repo"] = {"archivePresent": False}

    wb_audit = Counter()
    wb_archives = sorted(
        ((match.group(1), path) for path in raw_dir.glob("BGD_RTFP_mkt_2007_*.zip")
         if (match := WB_ARCHIVE_PATTERN.match(path.name))),
        key=lambda pair: pair[0],
    )
    dataset_version = ""
    if wb_archives:
        dataset_version = _append_reference_prices(records, wb_audit, wb_archives[-1][1])
        raw_stats["worldbank_rtfp"] = dict(wb_audit)
    else:
        raw_stats["worldbank_rtfp"] = {"archivePresent": False}

    ieee_zip = raw_dir / "crop-price-prediction-dataset-tensymp2024.zip"
    ieee_audit = Counter()
    if ieee_zip.exists():
        with zipfile.ZipFile(ieee_zip) as archive:
            member = next((item for item in archive.namelist() if item.endswith("Crop_Price_Dataset.csv")), None)
            if member:
                content = archive.read(member).decode("utf-8-sig")
                rows = list(csv.DictReader(io.StringIO(content)))
                _append_weekly_market_table(records, ieee_audit, rows)
        raw_stats["ieee_tensymp2024"] = dict(ieee_audit)
    else:
        raw_stats["ieee_tensymp2024"] = {"archivePresent": False}

    excluded: dict[str, Any] = {}
    trend_zip = raw_dir / "bd-price-trend-archive.zip"
    trend_audit = Counter()
    if trend_zip.exists():
        _append_unverified_trend(records, trend_audit, trend_zip)
        raw_stats["bd_price_trend_unverified"] = dict(trend_audit)
        with zipfile.ZipFile(trend_zip) as archive:
            member = next((item for item in archive.namelist() if item.lower().endswith("bd_price_trend.csv")), None)
            rows = 0
            if member:
                rows = max(0, len(table_rows(archive.read(member))) - 1)
            excluded["bd_price_trend"] = {
                "rowsInspected": rows, "rowsNormalizedReviewOnly": int(trend_audit.get("rowsOutput", 0)),
                "forecastEligible": False,
                "reason": "Retained in the local review-only master. No documented source, locality, price type, or data-collection method; never used for training or actual market display.",
            }
    else:
        raw_stats["bd_price_trend_unverified"] = {"archivePresent": False}
    frame = pd.DataFrame.from_records(records)
    if frame.empty:
        raise ValueError(f"No valid records found under {raw_dir}")
    frame = frame.sort_values(["source_code", "crop_name_en", "division", "district", "market", "price_type", "date"], kind="stable").reset_index(drop=True)
    # Flag robust outliers for review; keep them in the evidence file rather than silently deleting them.
    numeric = pd.to_numeric(frame["average_price"], errors="coerce")
    frame["outlier_review"] = False
    group_columns = ["source_code", "crop_id", "division", "district", "price_type", "unit"]
    for _, indices in frame.groupby(group_columns, dropna=False).groups.items():
        values = numeric.loc[indices].dropna()
        if len(values) < 8:
            continue
        q1, q3 = values.quantile([0.25, 0.75])
        spread = q3 - q1
        if spread > 0:
            frame.loc[indices, "outlier_review"] = numeric.loc[indices].lt(q1 - 1.5 * spread) | numeric.loc[indices].gt(q3 + 1.5 * spread)
    out_csv = output_dir / "bangladesh_crop_prices.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(out_csv, index=False, encoding="utf-8-sig", na_rep="")
    reference_output = _write_worldbank_reference_history(frame, output_dir.parent / "reference", dataset_version)
    report = _audit_frame(frame, raw_stats, excluded, output_dir / "market_data_audit.json")
    report["worldBankReferenceHistory"] = reference_output
    report["worldBankDatasetVersion"] = dataset_version or None
    (output_dir / "market_data_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return frame, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path(__file__).parent / "data/raw")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "data/processed")
    args = parser.parse_args()
    frame, report = build_dataset(args.raw_dir, args.output_dir)
    print(json.dumps({"rows": len(frame), "crops": frame.crop_name_en.nunique(), "audit": str(args.output_dir / "market_data_audit.json"), "bySource": {key: item["normalizedRows"] for key, item in report["sources"].items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
