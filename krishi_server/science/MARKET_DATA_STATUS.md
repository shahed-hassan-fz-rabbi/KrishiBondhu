# KrishiBondhu market data and model status

## Source inventory

`market_data_pipeline.py` reads the four supplied archives and the separate World Bank reference download. It keeps frequency, price type, source, license, location, and quality status on each normalized row. Run it from `krishi_server` with `science/.venv/Scripts/python.exe science/market_data_pipeline.py` (Windows) or the matching `.venv/bin/python` executable (Linux/macOS).

| Archive/source | Usable rows | Distinct priced products | Location coverage | Dates | Frequency / price types | Use |
| --- | ---: | ---: | --- | --- | --- | --- |
| AgriPriceBD daily archive | 17,746 | 5 | No market/district columns | 2020-07-22–2025-06-04 | Daily, retail and wholesale BDT/kg ranges | Historical model evaluation only; CC BY 4.0; not current quotes |
| Agricultural Commodity Price Forecasting repo | 2,514 | 6 | No market/district columns | 2022-01-08–2026-02-22 | Weekly, retail and wholesale; kg, 4-piece and 100-piece units | Review-only; some CSV-named files are XLSX workbooks; data reuse terms/source records need confirmation |
| `archive (1).zip` / IEEE TENSYMP 2024 | 11,738 | 53 with valid price rows (59 source product labels inspected) | 29 markets/districts in 7 divisions | 2022-01-08–2024-12-22 | Weekly, retail and wholesale BDT/kg | Research review only; source PDF limits data to academic/non-commercial use |
| `archive.zip` / BD_Price_Trend.csv | 50 | 20 labels | None | 2025-01-24–2025-06-14 | Daily label, but price type/source collection method unspecified | Retained as review-only; excluded from training and actual-price display |
| World Bank RTFP (separate download) | 114,720 | 4 | 119 markets plus national average; 64 districts | 2007-01–2026-11 | Monthly modeled reference estimates | Kept as a separate monthly reference/forecast product, never labeled as a current DAM price |

The normalized master has 146,768 rows and 83 distinct product labels across sources. Source-level crop counts overlap; they are not additive. The exact crop names, per-source counts, and parse skips are in `data/processed/market_data_audit.json` after a pipeline run.

## Current market feed

The public English DAM daily-report page was inspected on 2026-11-20. It uses a POST form with Division, District, Upazila, Market, Price Type, and date filters. The page provides print/PDF actions; no CSV/JSON export or documented public API contract was found. Its cascading selectors are populated by POST requests carrying a per-page CSRF token. This is a browser form, not an authorized machine-readable API contract. The DAM user guide describes price entry and management as staff operations. No authorization for unattended collection was identified, so KrishiBondhu does not replay the form requests, scrape the page, bypass the CSRF mechanism, or claim automatic daily synchronization.

An administrator can upload a DAM PDF as evidence, preview a structured CSV, check row values, and import by frequency. PDF text is evidence only; a person must transcribe/check market rows. Unverified imports remain review-only. Verified rows retain report date, price type, unit, Division, District, Upazila, Market, source URL, and successful import timestamp. The application exposes this timestamp, latest observation date, and stale state. Scheduled automated sync is disabled; the verified manual import is the operational path until DAM publishes or authorizes a stable machine-readable source.

Official references: [daily report](https://market.dam.gov.bd/market_daily_price_report/?L=E), [commodity report](https://market.dam.gov.bd/commodity_wise_report?L=E), [DAM user guide](https://market.dam.gov.bd/dam_user_guide/index.html).

## Dataset reuse and production boundary

- The AgriPriceBD publisher page identifies the daily dataset as CC BY 4.0, five crops, BDT/kg retail and wholesale observations. This is historical training/evaluation material only; its records stop in June 2025. The publisher page also reserves certain mining/AI-training rights in its general terms, so redistribution or further training beyond the stated open-access license should receive a license review. See [publisher record](https://data.mendeley.com/datasets/bkmxnrn3hn/1).
- The weekly forecasting repository's MIT license covers repository code, not clearly the bundled data. Keep its CSV/workbooks out of production-facing training until data reuse permission and provenance are confirmed. See [repository](https://github.com/RummanShahriar/Agricultural-Commodity-Price-Forecasting-in-Bangladesh).
- The IEEE source archive is restricted to academic/non-commercial use per its source paper and remains research-only. See [source paper](https://doi.org/10.1109/TENSYMP61132.2024.10752263).
- The `archive.zip` price-trend file has no clear price type or collection provenance and remains excluded from training and current quotes.
- The World Bank series is a separate monthly modeled reference product, not observed DAM transactions or today's prices. It remains frequency- and source-separated.

Production forecasts are available only from sufficient, fresh, administrator-verified observations with a consistent commodity, frequency, exact location, source, and unit. Histories with large date gaps are withheld. The on-demand evaluator compares naive persistence, seasonal-naive, Random Forest, and XGBoost candidates chronologically and returns the selected model version plus a fingerprint of the exact training observations. There is no independent scheduled retraining worker, persistent model registry, or automatic rollback in this deployment; model fit/evaluation occurs when a forecast is requested. Consequently, no claim of periodic retraining or registry-based rollback is made.

Official report: <https://market.dam.gov.bd/market_daily_price_report/?L=E>

## Model workflow

`market_forecast.py` compares persistence, seasonal naive, Random Forest, and XGBoost (when installed) in a chronological holdout. Daily candidates are scored for 7 and 30 days. Weekly candidates are scored for 1–4 weeks. Live forecasts require at least 180 daily, 104 weekly, or 48 monthly verified observations and a fresh last observation. Monthly World Bank training remains separate and uses one-step rolling chronological backtests.

`evaluate_market_frequency_models.py` creates a local evaluation report from the supplied historical daily/weekly archives. Those outputs are metrics only, not forecasts published to farmers; the IEEE research license and uncertain weekly data provenance prevent distributing these trained outputs as production models.

## Evaluation run (2026-11-20)

- Daily: 10 eligible series across Chickpea, Cucumber, Garlic, Green chilli, and Sweet pumpkin (retail and wholesale). Best candidate per series/horizon had median MAE **৳0.36/kg at 7 days** (median WAPE 0.62%) and **৳2.28/kg at 30 days** (median WAPE 8.11%). At the 30-day selection horizon the chosen candidates were persistence in 5/10, Random Forest in 2, seasonal naive in 1, and XGBoost in 2.
- Weekly: 6 eligible `BDT/kg` series across Egg Duck-Local, Egg Farm-Red, Gram (broken), and Onion (local). Best candidate per series/horizon had median MAE **৳4.64, ৳4.70, ৳8.31, and ৳13.05/kg** at 1–4 weeks (median WAPE 5.31%, 4.87%, 6.47%, and 9.50%). At the 4-week selection horizon, persistence was selected in 2/6, Random Forest in 1, and XGBoost in 3. These source series remain review/research data and are not served to farmers as live forecasts.
- The current frequency evaluation selected 16 series total. It excluded 19 series for discontinuous observation gaps and 93 for fewer than 104 usable weekly buckets. This stricter continuity gate explains why eligible counts differ from earlier evaluation runs.
- Monthly: 33 crop-division reference series trained, 2 too short and 1 stale series skipped; 33 next-month World Bank estimates. All 33 selected last-observation persistence. Median holdout MAE was **৳0.835** (units vary by commodity, BDT/kg or BDT/L); mean MAE was ৳1.066.

These are chronological backtest errors on historical source data, not guaranteed future accuracy. The daily archive ends in June 2025, weekly archives end by February 2026 (IEEE data ends December 2024), and only an administrator's recent verified DAM imports can power current farmer quotes and live forecasts.

## Run tests and evaluations

From `krishi_server`:

```powershell
science/.venv/Scripts/python.exe science/market_data_pipeline.py
science/.venv/Scripts/python.exe science/evaluate_market_frequency_models.py
science/.venv/Scripts/python.exe science/train_reference_models.py
science/.venv/Scripts/python.exe -m unittest discover -s science/tests -v
npm test
```
