"""Backtest monthly World Bank RTFP reference-price estimates by crop/area.

The target is explicitly the World Bank's modeled estimate, not an observed DAM
retail/wholesale quote. Validation is chronological and one-month-ahead.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

try:
    from xgboost import XGBRegressor
except Exception:  # XGBoost can be unavailable on unsupported CPU runtimes.
    XGBRegressor = None


MODEL_VERSION = "rtfp-monthly-reference-v1"
FEATURE_COLUMNS = [
    "lag_1", "lag_2", "lag_3", "lag_6", "lag_12",
    "rolling_mean_3", "rolling_mean_6", "rolling_mean_12",
    "month_sin", "month_cos", "trend_years",
]
MIN_SERIES_MONTHS = 96
HOLDOUT_MONTHS = 24


def _feature_frame(series: pd.Series) -> tuple[pd.DataFrame, pd.Series]:
    data = pd.DataFrame({"target": series.astype(float)})
    for lag in (1, 2, 3, 6, 12):
        data[f"lag_{lag}"] = series.shift(lag)
    for window in (3, 6, 12):
        data[f"rolling_mean_{window}"] = series.shift(1).rolling(window, min_periods=window).mean()
    months = data.index.month.to_numpy()
    data["month_sin"] = np.sin(2 * np.pi * months / 12)
    data["month_cos"] = np.cos(2 * np.pi * months / 12)
    data["trend_years"] = (np.arange(len(data), dtype=float) / 12.0)
    data = data.replace([np.inf, -np.inf], np.nan).dropna()
    return data[FEATURE_COLUMNS], data["target"]


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    errors = actual - predicted
    denom = float(np.sum(np.abs(actual)))
    return {
        "mae": float(np.mean(np.abs(errors))),
        "rmse": float(np.sqrt(np.mean(np.square(errors)))),
        "wape": float(np.sum(np.abs(errors)) / denom) if denom else float("nan"),
    }


def _models() -> dict[str, Any]:
    result: dict[str, Any] = {
        "random_forest": RandomForestRegressor(
            n_estimators=200, max_depth=5, min_samples_leaf=2,
            max_features=0.9, random_state=42, n_jobs=1,
        ),
    }
    if XGBRegressor is not None:
        result["xgboost"] = XGBRegressor(
            objective="reg:squarederror", n_estimators=250, max_depth=3,
            learning_rate=0.03, subsample=0.85, colsample_bytree=0.9,
            reg_lambda=5.0, random_state=42, n_jobs=1, verbosity=0,
        )
    return result


def _series_groups(frame: pd.DataFrame):
    world_bank = frame.loc[frame["source_code"].eq("worldbank_rtfp")].copy()
    world_bank["date"] = pd.to_datetime(world_bank["date"], errors="coerce")
    world_bank["average_price"] = pd.to_numeric(world_bank["average_price"], errors="coerce")
    world_bank["trust_score"] = pd.to_numeric(world_bank["trust_score"], errors="coerce")
    world_bank = world_bank.dropna(subset=["date", "average_price", "trust_score"])
    world_bank = world_bank.loc[
        (world_bank["average_price"] > 0)
        & (world_bank["trust_score"] >= 6)
        & (~world_bank["outlier_review"].astype(str).str.lower().eq("true"))
        & (~world_bank["spatially_interpolated"].astype(str).str.strip().eq("1"))
    ]
    # National average remains its own series. The eight divisions are an
    # unweighted median of available sub-market estimates for each month.
    national = world_bank.loc[world_bank["division"].eq("National")]
    regional = world_bank.loc[~world_bank["division"].eq("National")]
    for (crop, division), group in national.groupby(["crop_id", "division"], sort=True):
        yield crop, division, group.groupby("date")["average_price"].median().sort_index()
    for (crop, division), group in regional.groupby(["crop_id", "division"], sort=True):
        monthly = group.groupby("date")["average_price"].median().sort_index()
        yield crop, division, monthly


def train(frame_path: Path, output_dir: Path) -> dict[str, Any]:
    frame = pd.read_csv(frame_path, dtype={"date": str}, keep_default_na=False)
    versions = sorted(value for value in frame.loc[frame["source_code"].eq("worldbank_rtfp"), "source_version"].astype(str).unique() if value)
    dataset_version = versions[-1] if versions else "unknown"
    frame["outlier_review"] = frame["outlier_review"].astype(str).str.lower().eq("true")
    series_results: list[dict[str, Any]] = []
    forecasts: list[dict[str, Any]] = []
    model_dir = output_dir / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    skipped = {"insufficient_months": 0, "insufficient_backtest_features": 0, "stale_history": 0}
    current_month = pd.Timestamp.now().to_period("M").to_timestamp()

    for crop_id, division, observed in _series_groups(frame):
        month_index = pd.date_range(observed.index.min().to_period("M").to_timestamp(), observed.index.max().to_period("M").to_timestamp(), freq="MS")
        series = observed.groupby(observed.index.to_period("M")).median()
        series.index = series.index.to_timestamp()
        series = series.reindex(month_index)
        next_month = series.index[-1] + pd.offsets.MonthBegin(1)
        if next_month <= current_month:
            skipped["stale_history"] += 1
            continue
        if int(series.notna().sum()) < MIN_SERIES_MONTHS:
            skipped["insufficient_months"] += 1
            continue
        features, target = _feature_frame(series)
        holdout_start = series.index[-1] - pd.DateOffset(months=HOLDOUT_MONTHS - 1)
        train_mask = features.index < holdout_start
        test_mask = features.index >= holdout_start
        x_train, y_train = features.loc[train_mask], target.loc[train_mask]
        x_test, y_test = features.loc[test_mask], target.loc[test_mask]
        if len(x_train) < 48 or len(x_test) < 20:
            skipped["insufficient_backtest_features"] += 1
            continue

        models: dict[str, Any] = {
            "last_observation": None,
            "seasonal_naive_12m": None,
            **_models(),
        }
        predictions: dict[str, np.ndarray] = {
            "last_observation": series.shift(1).reindex(x_test.index).to_numpy(dtype=float),
            "seasonal_naive_12m": series.shift(12).reindex(x_test.index).to_numpy(dtype=float),
        }
        fitted: dict[str, Any] = {}
        for name, model in list(models.items())[2:]:
            model.fit(x_train, y_train)
            predictions[name] = np.asarray(model.predict(x_test), dtype=float)
            fitted[name] = model

        evaluations = {
            name: _metrics(y_test.to_numpy(dtype=float), prediction)
            for name, prediction in predictions.items()
            if len(prediction) == len(y_test) and np.isfinite(prediction).all()
        }
        if not evaluations:
            skipped["insufficient_backtest_features"] += 1
            continue
        selected = min(evaluations, key=lambda model_name: evaluations[model_name]["mae"])
        selected_prediction = predictions[selected]
        residuals = y_test.to_numpy(dtype=float) - selected_prediction
        abs_error_q90 = float(np.quantile(np.abs(residuals), 0.9, method="higher"))

        # Refit a tree model on all eligible observations; baselines use latest history directly.
        final_model = None
        if selected in {"random_forest", "xgboost"}:
            final_model = _models()[selected]
            final_model.fit(features, target)
        latest_context = series.copy()
        forecast_row = pd.DataFrame([{
            "lag_1": latest_context.iloc[-1], "lag_2": latest_context.iloc[-2],
            "lag_3": latest_context.iloc[-3], "lag_6": latest_context.iloc[-6],
            "lag_12": latest_context.iloc[-12],
            "rolling_mean_3": latest_context.iloc[-3:].mean(),
            "rolling_mean_6": latest_context.iloc[-6:].mean(),
            "rolling_mean_12": latest_context.iloc[-12:].mean(),
            "month_sin": np.sin(2 * np.pi * next_month.month / 12),
            "month_cos": np.cos(2 * np.pi * next_month.month / 12),
            "trend_years": len(series) / 12,
        }], columns=FEATURE_COLUMNS)
        if selected == "last_observation":
            point = float(series.iloc[-1])
        elif selected == "seasonal_naive_12m":
            point = float(series.iloc[-12])
        else:
            point = float(final_model.predict(forecast_row)[0])
        point = max(point, 0.01)

        metadata = {
            "modelVersion": MODEL_VERSION, "modelId": f"{crop_id}-{division.lower()}-{hashlib.sha1(f'{crop_id}|{division}'.encode()).hexdigest()[:8]}",
            "cropId": crop_id, "division": division, "frequency": "monthly",
            "observations": int(series.notna().sum()), "historyStart": series.first_valid_index().date().isoformat(),
            "historyEnd": series.last_valid_index().date().isoformat(), "trainingThrough": series.last_valid_index().date().isoformat(),
            "backtest": {"method": "last 24 eligible months; rolling one-step-ahead; chronological; no shuffle", "points": int(len(y_test)), "models": evaluations, "selectedModel": selected},
            "uncertainty": {"kind": "empirical_absolute_error_quantile", "quantile": 0.9, "value": round(abs_error_q90, 4), "validationPoints": int(len(residuals))},
            "source": "World Bank RTFP modeled monthly market estimates; division values are unweighted medians of eligible market estimates; trust score >= 6; non-spatially-interpolated records only",
            "limitations": "Forecast is for next month's World Bank reference estimate only. This is not a daily DAM quote, retail/wholesale price, or farmer selling price; no 7/15/30-day result is supported by monthly source data.",
        }
        model_path = model_dir / f"{metadata['modelId']}.joblib"
        joblib.dump({"estimator": final_model, "featureColumns": FEATURE_COLUMNS, "metadata": metadata}, model_path)
        metadata["modelArtifact"] = model_path.name
        series_results.append(metadata)
        forecasts.append({
            "cropId": crop_id, "division": division, "priceType": "reference_estimate",
            "frequency": "monthly", "forecastMonth": next_month.date().isoformat(),
            "price": round(point, 2), "lower90": round(max(0.01, point - abs_error_q90), 2),
            "upper90": round(point + abs_error_q90, 2), "latestObservedOn": series.last_valid_index().date().isoformat(),
            "selectedModel": selected, "metrics": evaluations[selected], "modelId": metadata["modelId"],
            "source": "World Bank RTFP modeled monthly market estimates", "uncertaintyType": "one-step chronological holdout error band",
        })

    output_dir.mkdir(parents=True, exist_ok=True)
    reference_dir = output_dir.parent / "reference"
    reference_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "modelVersion": MODEL_VERSION,
        "sourceDataset": f"World Bank BGD_2021_RTFP_v02_M version {dataset_version}",
        "forecastFrequency": "monthly",
        "forecastHorizonSupported": ["1 month ahead"],
        "excludedSources": ["DAM-research-repository archive: provenance/location not supplied", "IEEE TENSYMP archive: academic/non-commercial only; source values require review", "BD_Price_Trend: source/price type/location undocumented"],
        "minSeriesMonths": MIN_SERIES_MONTHS, "holdoutMonths": HOLDOUT_MONTHS,
        "modelFamilies": ["last_observation", "seasonal_naive_12m", "random_forest"] + (["xgboost"] if XGBRegressor is not None else []),
        "aggregation": "National stays separate. Division reference series are unweighted monthly medians across eligible sub-market estimates.",
        "seriesTrained": len(series_results), "seriesSkipped": skipped,
        "results": series_results, "xgboostAvailable": XGBRegressor is not None,
    }
    (output_dir / "worldbank_reference_model_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    (reference_dir / "worldbank_reference_forecasts.json").write_text(json.dumps({
        "modelVersion": MODEL_VERSION, "sourceDataset": report["sourceDataset"],
        "forecastFrequency": "monthly", "horizonSupported": "1 month ahead",
        "updatedAt": dataset_version, "forecasts": forecasts,
    }, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path(__file__).parent / "data/processed/bangladesh_crop_prices.csv")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "data/processed")
    args = parser.parse_args()
    report = train(args.input, args.output_dir)
    forecast_file = args.output_dir.parent / "reference/worldbank_reference_forecasts.json"
    print(json.dumps({"seriesTrained": report["seriesTrained"], "seriesSkipped": report["seriesSkipped"], "forecastCount": len(json.loads(forecast_file.read_text(encoding="utf-8"))["forecasts"]), "report": str(args.output_dir / "worldbank_reference_model_report.json")}))


if __name__ == "__main__":
    main()
