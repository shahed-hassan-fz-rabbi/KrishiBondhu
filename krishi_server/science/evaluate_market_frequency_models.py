"""Chronologically evaluate daily/weekly review-series without publishing forecasts.

Only AgriPriceBD daily and the two supplied weekly archive sources are read.
The output is an audit report, not a live-market product or production model.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from science.market_forecast import forecast_market_prices
except ImportError:  # Running this file directly from the science directory.
    from market_forecast import forecast_market_prices


SOURCE_ALLOWLIST = {
    "agripricebd_daily", "dam_research_repo", "ieee_tensymp2024",
}


def evaluate(input_path: Path) -> dict[str, Any]:
    frame = pd.read_csv(input_path, encoding="utf-8-sig")
    frame = frame[frame["source_code"].isin(SOURCE_ALLOWLIST)].copy()
    results: list[dict[str, Any]] = []
    skipped: dict[str, int] = {}
    for (source, frequency, crop, price_type, unit), group in frame.groupby(
        ["source_code", "frequency", "crop_name_en", "price_type", "unit"], sort=True
    ):
        # Location-bearing weekly rows are reduced to a same-date national median.
        # The resulting series is explicitly labeled as a research aggregation.
        series = group.groupby("date", sort=True)["average_price"].median().reset_index()
        horizon = 30 if frequency == "daily" else 28
        observations = [
            {"date": str(row.date)[:10], "price": float(row.average_price)}
            for row in series.itertuples(index=False)
        ]
        result = forecast_market_prices({
            "observations": observations, "frequency": frequency,
            "horizonDays": horizon, "priceType": price_type, "unit": unit,
            "source": source,
        })
        if not result.get("success"):
            key = f"{source}|{frequency}|{crop}|{price_type}"
            skipped[result.get("error", "unavailable")] = skipped.get(result.get("error", "unavailable"), 0) + 1
            continue
        meta = result["meta"]
        results.append({
            "source": source, "frequency": frequency, "commodity": crop,
            "priceType": price_type, "unit": unit, "seriesScope": "daily source series" if frequency == "daily" else "date-level median across included weekly source rows; location-specific predictions are not published",
            "historyStart": meta["historyStart"], "historyEnd": meta["historyEnd"],
            "observations": meta["observationsUsed"], "selectedModel": meta["selectedModel"],
            "supportedBacktestHorizons": meta["backtest"]["horizonMetrics"],
            "selectionMetrics": meta["backtest"]["selected"],
            "forecastPublished": False,
            "limitation": "Input source is historical and/or review-only; no forecast from this evaluation is a current price or production output.",
        })
    return {
        "reportVersion": "market-frequency-chronological-evaluation-v1",
        "method": "Final chronological holdout. Candidate selection compares persistence, seasonal naive (7 daily / 52 weekly where available), Random Forest and XGBoost (when installed). No shuffle.",
        "selectedSeries": len(results), "skippedSeries": skipped,
        "supportedFrequencies": sorted({item["frequency"] for item in results}),
        "modelsCompared": ["last_observation", "seasonal_naive", "random_forest", "xgboost (when installed)"],
        "results": results,
        "sourceUse": "AgriPriceBD is the CC BY 4.0 historical daily source. Weekly research sources are retained for local review/backtest only; IEEE TENSYMP data is academic/non-commercial and not packaged as production output.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path(__file__).parent / "data/processed/bangladesh_crop_prices.csv")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "data/processed/market_frequency_evaluation.json")
    args = parser.parse_args()
    report = evaluate(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"selectedSeries": report["selectedSeries"], "skippedSeries": report["skippedSeries"], "supportedFrequencies": report["supportedFrequencies"], "report": str(args.output)}))


if __name__ == "__main__":
    main()
