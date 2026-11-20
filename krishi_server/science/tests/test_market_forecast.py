import unittest
from datetime import date, timedelta

import numpy as np

from science.market_forecast import forecast_market_prices


def series(days=420):
    start = date(2023, 1, 1)
    return [
        {"date": (start + timedelta(days=index)).isoformat(), "price": 45 + 4 * np.sin(index * 2 * np.pi / 7) + index * 0.01}
        for index in range(days)
    ]


class MarketForecastTests(unittest.TestCase):
    def test_daily_forecast_compares_models_and_reports_7_and_30_day_backtests(self):
        result = forecast_market_prices({"observations": series(), "frequency": "daily", "horizonDays": 7, "unit": "BDT/kg"})
        self.assertTrue(result["success"], result)
        self.assertEqual(result["meta"]["frequency"], "daily")
        self.assertIn("7", result["meta"]["backtest"]["horizonMetrics"])
        self.assertIn("30", result["meta"]["backtest"]["horizonMetrics"])
        self.assertIn(result["meta"]["selectedModel"], result["meta"]["backtest"]["candidateMetrics"])
        self.assertEqual(len(result["data"]["forecast"]), 7)

    def test_weekly_does_not_claim_daily_periods(self):
        start = date(2020, 1, 5)
        observations = [{"date": (start + timedelta(days=index * 7)).isoformat(), "price": 60 + index * 0.1} for index in range(140)]
        result = forecast_market_prices({"observations": observations, "frequency": "weekly", "horizonDays": 28, "unit": "BDT/kg"})
        self.assertTrue(result["success"], result)
        self.assertEqual(result["meta"]["frequency"], "weekly")
        self.assertEqual(len(result["data"]["forecast"]), 4)

    def test_daily_history_with_a_large_gap_is_withheld(self):
        observations = series(200)
        observations = [*observations[:100], *[
            {**item, "date": (date.fromisoformat(item["date"]) + timedelta(days=60)).isoformat()}
            for item in observations[100:]
        ]]
        result = forecast_market_prices({"observations": observations, "frequency": "daily", "horizonDays": 7})
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "discontinuous_history")
        self.assertGreater(result["meta"]["largestGapDays"], 7)

    def test_model_version_fingerprints_the_training_series(self):
        first = forecast_market_prices({"observations": series(), "frequency": "daily", "horizonDays": 7})
        changed = series()
        changed[-1] = {**changed[-1], "price": changed[-1]["price"] + 2}
        second = forecast_market_prices({"observations": changed, "frequency": "daily", "horizonDays": 7})
        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(first["meta"]["modelVersion"], "market-frequency-compare-v2")
        self.assertNotEqual(first["meta"]["trainingDataVersion"], second["meta"]["trainingDataVersion"])
        self.assertEqual(len(first["data"]["forecast"]), 7)

    def test_insufficient_history_is_not_forecast(self):
        result = forecast_market_prices({"observations": series(80), "frequency": "daily"})
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "insufficient_history")


if __name__ == "__main__":
    unittest.main()
