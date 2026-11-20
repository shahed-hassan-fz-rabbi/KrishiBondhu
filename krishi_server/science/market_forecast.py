"""Frequency-aware market forecasts with chronological model selection.

The engine works on actual observations supplied by the API. The separate
World Bank monthly reference pipeline does not pass through this module.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, timedelta
from typing import Any

import numpy as np

try:
    from sklearn.ensemble import RandomForestRegressor
except Exception:  # Keep clear baseline-only behavior on minimal Python installs.
    RandomForestRegressor = None

try:
    from xgboost import XGBRegressor
except Exception:
    XGBRegressor = None

MODEL_VERSION = "market-frequency-compare-v2"
PERIOD_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}
MAX_HORIZON = {"daily": 30, "weekly": 4, "monthly": 1}
MIN_OBSERVATIONS = {"daily": 180, "weekly": 104, "monthly": 48}
MAX_OBSERVATION_GAP_DAYS = {"daily": 7, "weekly": 21, "monthly": 62}


def _clean_observations(observations: Any) -> tuple[list[date], np.ndarray, int]:
    if not isinstance(observations, list):
        raise ValueError("observations must be an array")
    by_day: dict[date, list[float]] = {}
    dropped = 0
    for item in observations:
        try:
            day = date.fromisoformat(str(item.get("date", ""))[:10])
            low = float(item.get("priceMin", item.get("price", "nan")))
            high = float(item.get("priceMax", item.get("price", "nan")))
            if not np.isfinite(low) or not np.isfinite(high) or low <= 0 or high < low:
                raise ValueError("invalid price")
            by_day.setdefault(day, []).append((low + high) / 2.0)
        except (AttributeError, TypeError, ValueError, OverflowError):
            dropped += 1
    days = sorted(by_day)
    prices = np.asarray([float(np.median(by_day[day])) for day in days], dtype=float)
    return days, prices, dropped


def _seasonal_lag(frequency: str) -> int:
    return {"daily": 7, "weekly": 52, "monthly": 12}[frequency]


def _features(values: np.ndarray, index: int, frequency: str) -> list[float]:
    if frequency == "daily":
        lags, windows, cycle_days = (1, 2, 3, 7, 14, 28), (7, 14, 28), 365.2425
        date_scale = 1.0
    elif frequency == "weekly":
        lags, windows, cycle_days = (1, 2, 4, 8, 13, 26, 52), (4, 13, 52), 365.2425 / 7
        date_scale = 7.0
    else:
        lags, windows, cycle_days = (1, 2, 3, 6, 12), (3, 6, 12), 365.2425 / 30
        date_scale = 30.0
    row = [float(values[index - lag]) for lag in lags]
    row.extend(float(np.mean(values[index - window:index])) for window in windows)
    elapsed = index * date_scale
    phase = 2.0 * np.pi * elapsed / cycle_days
    row.extend((float(np.sin(phase)), float(np.cos(phase)), float(elapsed / cycle_days)))
    return row


def _matrix(values: np.ndarray, frequency: str) -> tuple[np.ndarray, np.ndarray, int]:
    seasonal = _seasonal_lag(frequency)
    lag_set = {"daily": 28, "weekly": 52, "monthly": 12}[frequency]
    start = lag_set
    rows, targets = [], []
    for index in range(start, len(values)):
        rows.append(_features(values, index, frequency))
        targets.append(values[index])
    return np.asarray(rows, dtype=float), np.asarray(targets, dtype=float), start


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = actual - predicted
    denominator = float(np.sum(np.abs(actual)))
    return {
        "mae": round(float(np.mean(np.abs(error))), 4),
        "rmse": round(float(np.sqrt(np.mean(error**2))), 4),
        "wape": round(float(np.sum(np.abs(error)) / denominator), 6) if denominator else 0.0,
    }


def _new_models() -> dict[str, Any]:
    models: dict[str, Any] = {}
    if RandomForestRegressor is not None:
        models["random_forest"] = RandomForestRegressor(
            n_estimators=64, max_depth=7, min_samples_leaf=2,
            max_features=0.9, random_state=42, n_jobs=1,
        )
    if XGBRegressor is not None:
        models["xgboost"] = XGBRegressor(
            objective="reg:squarederror", n_estimators=64, max_depth=2,
            learning_rate=0.035, subsample=0.85, colsample_bytree=0.9,
            reg_lambda=5.0, random_state=42, n_jobs=1, verbosity=0, tree_method="hist",
        )
    return models


def forecast_market_prices(payload: dict[str, Any]) -> dict[str, Any]:
    frequency = str(payload.get("frequency", "daily")).lower()
    if frequency not in PERIOD_DAYS:
        return {"success": False, "error": "unsupported_frequency", "message": "Frequency must be daily, weekly, or monthly."}
    days, prices, dropped = _clean_observations(payload.get("observations"))
    if len(days) < MIN_OBSERVATIONS[frequency]:
        return {"success": False, "error": "insufficient_history", "message": f"Need at least {MIN_OBSERVATIONS[frequency]} valid {frequency} observations; found {len(days)}.", "meta": {"validObservations": len(days), "droppedObservations": dropped, "frequency": frequency, "modelVersion": MODEL_VERSION}}
    largest_gap = max(((current - previous).days for previous, current in zip(days, days[1:])), default=0)
    if largest_gap > MAX_OBSERVATION_GAP_DAYS[frequency]:
        return {"success": False, "error": "discontinuous_history", "message": f"The {frequency} history has a {largest_gap}-day gap; the supported maximum is {MAX_OBSERVATION_GAP_DAYS[frequency]} days. A stable forecast is withheld until the recent series is complete.", "meta": {"validObservations": len(days), "largestGapDays": largest_gap, "frequency": frequency, "modelVersion": MODEL_VERSION}}

    x, y, start = _matrix(prices, frequency)
    max_horizon = MAX_HORIZON[frequency]
    split = len(y) - max_horizon
    if split < max(48, len(x[0]) * 2):
        return {"success": False, "error": "insufficient_backtest_history", "message": "Not enough chronological history remains for training and backtesting."}

    seasonal = _seasonal_lag(frequency)
    origin = start + split
    prefix = prices[:origin].tolist()
    actual_test = prices[origin:origin + max_horizon]
    horizon_by_frequency = {"daily": [7, 30], "weekly": [1, 2, 3, 4], "monthly": [1]}
    evaluation_horizons = horizon_by_frequency[frequency]
    candidate_names = ["last_observation"]
    if len(prefix) >= seasonal:
        candidate_names.append("seasonal_naive")
    candidates = _new_models()
    fitted: dict[str, Any] = {}
    for name, model in candidates.items():
        model.fit(x[:split], y[:split])
        fitted[name] = model

    def forecast_path(name: str, model: Any, initial: list[float], periods: int) -> np.ndarray:
        sequence = list(initial)
        predicted: list[float] = []
        for _ in range(periods):
            if name == "last_observation":
                value = sequence[-1]
            elif name == "seasonal_naive":
                value = sequence[-seasonal]
            else:
                row = np.asarray([_features(np.asarray(sequence), len(sequence), frequency)], dtype=float)
                value = float(model.predict(row)[0])
            value = max(0.01, float(value))
            predicted.append(value)
            sequence.append(value)
        return np.asarray(predicted, dtype=float)

    predictions: dict[str, np.ndarray] = {
        name: forecast_path(name, None, prefix, max_horizon) for name in candidate_names
    }
    for name in fitted:
        prediction = forecast_path(name, fitted[name], prefix, max_horizon)
        if np.isfinite(prediction).all():
            predictions[name] = prediction
    horizon_metrics: dict[str, dict[str, dict[str, float]]] = {}
    horizon_selections: dict[int, str] = {}
    for evaluation_horizon in evaluation_horizons:
        actual = actual_test[:evaluation_horizon]
        metrics = {name: _metrics(actual, prediction[:evaluation_horizon]) for name, prediction in predictions.items()}
        horizon_metrics[str(evaluation_horizon)] = metrics
        horizon_selections[evaluation_horizon] = min(metrics, key=lambda name: (metrics[name]["mae"], metrics[name]["rmse"]))

    requested = payload.get("horizonPeriods")
    if requested is None:
        requested = int(np.ceil(int(payload.get("horizonDays", 30)) / PERIOD_DAYS[frequency]))
    horizon = max(1, min(int(requested), max_horizon))
    selection_horizon = min(horizon, evaluation_horizons[-1])
    selected = horizon_selections.get(selection_horizon, horizon_selections[evaluation_horizons[-1]])
    selected_metrics = horizon_metrics[str(selection_horizon)][selected]
    interval_error = float(np.quantile(np.abs(actual_test[:selection_horizon] - predictions[selected][:selection_horizon]), 0.9, method="higher"))
    last_day = days[-1]
    training_data_version = hashlib.sha256(json.dumps(
        {"frequency": frequency, "dates": [item.isoformat() for item in days], "prices": np.round(prices, 6).tolist()},
        separators=(",", ":"),
    ).encode("utf-8")).hexdigest()[:16]
    step_days = PERIOD_DAYS[frequency]
    sequence = prices.tolist()
    forecast = []
    final_model = fitted.get(selected)
    if final_model is not None:
        final_model.fit(x, y)
    final_path = forecast_path(selected, final_model, sequence, horizon)
    for step, point in enumerate(final_path, start=1):
        observed = last_day + timedelta(days=step_days * step)
        forecast.append({"date": observed.isoformat(), "price": round(float(point), 2), "lower90": round(max(0.01, float(point) - interval_error), 2), "upper90": round(float(point) + interval_error, 2)})

    return {
        "success": True,
        "meta": {
            "modelVersion": MODEL_VERSION, "frequency": frequency,
            "trainingDataVersion": training_data_version,
            "observationsUsed": len(days), "droppedObservations": dropped,
            "historyStart": days[0].isoformat(), "historyEnd": last_day.isoformat(),
            "priceType": payload.get("priceType"), "unit": payload.get("unit", "BDT/kg"),
            "source": payload.get("source", "verified market observations"),
            "selectedModel": selected,
            "backtest": {
                "method": f"chronological {max_horizon}-period recursive holdout; no shuffle",
                "observations": len(actual_test), "horizonPeriods": selection_horizon,
                "selected": selected_metrics, "candidateMetrics": horizon_metrics[str(selection_horizon)],
                "horizonMetrics": horizon_metrics,
            },
            "forecastSupported": f"up to {max_horizon} {frequency} periods",
            "limitations": "Historical statistical estimate; not a guaranteed price. The interval reflects chronological holdout error and excludes sudden weather, policy, supply, transport, or grade shocks.",
        },
        "data": {"latestObservedPrice": round(float(prices[-1]), 2), "latestObservedOn": last_day.isoformat(), "forecast": forecast},
    }
