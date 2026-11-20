# KrishiBondhu — Python Scientific Processing Engine

**Package:** `server/science/`  
**Formula Version:** `v1.0.0-phase3`  
**Runtime:** Python 3.11+ / NumPy 2.x  
**Data Source:** NASA POWER Daily Agroclimatology Point Dataset (`nasa:power:daily:point`)  
**Time Standard:** Local Solar Time (`LST`) — solar-day boundary, not Bangladesh Standard Time (BST, UTC+6).

---

## 1. Scientific Philosophy & Principles

1. **Deterministic Calculations:** All analytical results, totals, means, and percentiles are produced through pure, repeatable NumPy calculations. Values are never generated, estimated, or modified by LLMs.
2. **Missing-Data Integrity:** Missing values (sentinels such as `-999`, nulls, absent days) are strictly excluded from mathematical summations and averages. Missing observations are **NEVER converted to zero**.
3. **Incomplete-Period Accounting:** A 90% completeness threshold is enforced. Any month or year with fewer than 90% of expected calendar days validly recorded is flagged as `is_complete: false` and excluded from historical normals calculations. Temperature absolute monthly extrema are currently calculated from any available valid daily extrema, even when the containing month is incomplete; consumers should treat these as observed extrema, not complete-month baselines.
4. **Descriptive Evidence Only:** In Phase 3, this engine produces descriptive statistics and historical percentiles only. It does not compute predictive risk categories, yield guarantees, or synthetic sowing dates.

---

## 2. Statistical Formulas & Methodologies

### 2.1 Percentile Method & Evidence Guardrails
Percentiles ($P_{25}, P_{50}, P_{75}, P_{90}$) are computed using standard **linear interpolation** (`np.percentile(arr, q, method="linear")`, equivalent to Hyndman & Fan Type 7, the standard in SciPy, R, and Excel).
$$\text{Index} = (N - 1) \times \frac{q}{100}$$
Value is interpolated linearly between closest data ranks.

* **Sample Size Evidence Guardrail:** A single year or limited historical records ($N < 5$ years) are mathematically insufficient for robust climatological percentile baselines. When $N < 5$, percentiles describe only the limited sample and the engine returns `evidence_status: "insufficient_sample"` alongside an explicit limitation disclosure.

### 2.2 Rainfall Statistics (`PRECTOTCORR`, `mm/day`)
* **Daily Rainfall:** Pure daily observations in `mm/day`.
* **Monthly Rainfall Total:**
  $$\text{Total}_{\text{month}} = \sum_{i=1}^{N_{\text{valid}}} \text{Rainfall}_i$$
* **Annual Rainfall Total:** Sum of all 12 monthly totals for a complete year.
* **Project-Selected Wet-Day Threshold:** Count valid observed days in a month where $\text{Rainfall} \ge 1.0\text{ mm}$. This threshold is a descriptive convention for this project, not an agronomic threshold or crop-risk rule.
* **Project-Selected Dry-Day Count:** Among valid observed days only, count days where $\text{Rainfall} < 1.0\text{ mm}$. Sentinel, absent, null, and otherwise invalid observations are excluded from both counts; `valid_days` is the denominator for any frequency rate. The current engine reports counts, not a percentage frequency.
* **Historical Monthly Normals:** For each calendar month, calculate that month's total separately in each year with at least 90% of expected days valid. The reported mean and percentiles ($P_{25}, P_{50}, P_{75}, P_{90}$) then treat each qualifying year-month total equally; they are not pooled daily totals. Percentiles use Type 7 linear interpolation and are marked insufficient when fewer than five year values are available.

### 2.2.1 Annual Weighting
Annual rainfall distributions contain one complete-year total per year (at least 90% of expected daily observations); annual temperature and generic-parameter distributions contain one complete-year mean per qualifying year. The summary mean therefore gives each qualifying year equal weight, regardless of the number of valid days above the completeness threshold. The exposed annual series also retains incomplete-year partial totals with `is_complete: false`; those values are excluded from annual historical distributions and must not be presented as complete-year totals.

The 90% annual/seasonal coverage rule is an aggregate period denominator: missing days may be clustered in one month while the whole year still meets 90%. In that case a rainfall total can omit a substantial sub-period and remain eligible for the annual distribution. The completeness flag reports coverage by this rule; it is not a guarantee that gaps are evenly distributed or scientifically harmless. Review this policy before using annual totals as a strong baseline.

The top-level `years_used` field currently reports the number of distinct years represented in the input, not the number of complete years in every statistic. For actual statistic sample sizes, use `annual_historical.count` and the relevant month/season `years_used` value.

### 2.3 Meteorological Seasons (Bangladesh Climatological Cycle)
Seasons are defined following the standard 4-season climatological cycle recognized by the **Bangladesh Meteorological Department (BMD)** and national agro-ecological zoning:
1. **Winter (`winter`):** December to February (Dec–Feb, 3 months) — Rabi crop season, cool & dry.
   * *Climatological Season Boundary:* Winter is calculated across the calendar-year boundary. For Winter associated with year $Y$ (e.g. Winter 2020–2021, ending year 2021), the grouping is:
     $$\text{Winter}_{Y} = \text{Dec}_{Y-1} + \text{Jan}_{Y} + \text{Feb}_{Y}$$
     December of year $Y$ is **NEVER** grouped with January/February of year $Y$.
2. **Pre-Monsoon (`pre_monsoon`):** March to May (Mar–May, 3 months) — Hot pre-monsoon season, thunderstorms (Kalbaishakhi).
3. **Monsoon (`monsoon`):** June to September (Jun–Sep, 4 months) — South-west monsoon, main rainy season (Kharif-2).
4. **Post-Monsoon (`post_monsoon`):** October to November (Oct–Nov, 2 months) — Retreating monsoon, transitional period.

Seasonal totals are calculated by summing rainfall across the constituent calendar months, and historical distributions ($P_{25}, P_{50}, P_{75}, P_{90}$) are derived across all valid years.

### 2.4 Temperature Statistics (`T2M`, `T2M_MAX`, `T2M_MIN`, `°C`)
* **Monthly Mean Temperature:** $\text{mean}(T_{2M})$
* **Monthly Mean Maximum:** $\text{mean}(T_{2M\_MAX})$
* **Monthly Absolute Maximum:** $\max(T_{2M\_MAX})$
* **Monthly Mean Minimum:** $\text{mean}(T_{2M\_MIN})$
* **Monthly Absolute Minimum:** $\min(T_{2M\_MIN})$
* **Diurnal Temperature Range (DTR):**
  $$\text{DTR} = \text{mean}(T_{2M\_MAX}) - \text{mean}(T_{2M\_MIN})$$

### 2.5 Other Parameters
* **Relative Humidity (`RH2M`, `%`):** Monthly and annual means, $P_{25}, P_{50}, P_{75}, P_{90}$.
* **Solar Radiation (`ALLSKY_SFC_SW_DWN`, `MJ/m²/day`):** Monthly daily mean insolation, annual insolation, $P_{25}, P_{50}, P_{75}, P_{90}$.

### 2.6 Period Comparison Tests (exploratory, non-attributional)
Comparisons such as Period 1 (2001–2012) vs Period 2 (2013–2025) use two-sided tests and are labeled exploratory throughout. They establish neither climate-change attribution nor agronomic significance.

* **Welch's t-test.**
  $$t = \frac{\bar{x}_2 - \bar{x}_1}{\sqrt{v_1/n_1 + v_2/n_2}}, \quad
  \nu = \frac{(v_1/n_1 + v_2/n_2)^2}{\frac{(v_1/n_1)^2}{n_1-1} + \frac{(v_2/n_2)^2}{n_2-1}}$$
  The two-sided p-value uses the Student's t distribution with $\nu$ (Welch–Satterthwaite) degrees of freedom:
  $$p = I_x\!\left(\tfrac{\nu}{2}, \tfrac{1}{2}\right), \quad x = \frac{\nu}{\nu + t^2}$$
  where $I_x$ is the regularized incomplete beta function, evaluated by the hypergeometric power series
  $I_x(a,b) = \frac{x^a(1-x)^b}{aB(a,b)} \sum_{n=0}^{\infty} \frac{(a+b)_n}{(a+1)_n} x^n$ with one reflection at $x > (a+1)/(a+b+2)$ (full double precision on the relevant domain; regression-tested against published critical-value tables). For $\nu \ge 10{,}000$ the documented normal-limit branch is used ($t \to N(0,1)$ as $\nu \to \infty$; the correction is below double-precision noise). The response distinguishes the two regimes via `p_value_kind`: exact finite-df evaluations are labeled `"exact_distribution"`, the normal-limit branch is labeled `"normal_limit"` and is never presented as an exact finite-df Student-t calculation. `method` stays `"student_t_welch_satterthwaite_two_sided"`. The former normal (`erf`) approximation for typical sample sizes is no longer used.

* **Mann–Whitney U.** Asymptotic normal approximation with:
  - average ranks for ties,
  - **tie-corrected variance** $\sigma_U^2 = \frac{n_1 n_2 (N+1)}{12} - \frac{\sum_k (t_k^3 - t_k)}{12N(N-1)}$ over tie groups ($N = n_1+n_2$),
  - **continuity correction** of 0.5 as in scipy's default asymptotic method,
  - a validity guard: `is_significant` requires both groups $\ge 8$ years; smaller samples report `approximation_valid: false` and a conservative `is_significant: false`.

  Every result carries `approximation_note`, which states that the n ≥ 8 guard is a rule-of-thumb screening criterion only — it does not guarantee accuracy, especially with heavy ties or skewed distributions. `p_value_kind` stays `"approximate"`: an asymptotic probability, never an exact permutation probability.

  The p-value is always labeled `p_value_kind: "approximate"`; it is an asymptotic probability, never an exact permutation probability.

### 2.7 Incomplete Rainfall Totals Disclosure
Legacy gated flat fields (`oct_total_rain ≥ 28` valid days, `oct_late_rain ≥ 14`, `nov_total_rain ≥ 27`) keep their exact previous contract and values. Each yearly record additionally carries `rainfall_period_totals` with, per window (October, late October Oct 16–31, November, sowing window):
`expected_days`, `valid_days`, `missing_days`, `period_coverage_percent`, `total_kind` (`complete_period_total` | `observed_partial_sum` | `no_observations`), and the ungated `raw_observed_sum_mm` preserving the observed-day sum. Missing days are never imputed and raw partial sums are never relabeled as complete periods.

---

## 3. JSON Contract Specification

### 3.1 Input Snapshot Format
```json
{
  "district": "chattogram",
  "parameters": ["PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN"],
  "dateRange": { "start": "2001-01-01", "end": "2025-12-31" },
  "observations": [
    {
      "dateLabel": "2001-01-01",
      "parameter": "PRECTOTCORR",
      "value": 0.0,
      "quality": "ok",
      "unit": "mm/day",
      "timeStandard": "LST"
    }
  ]
}
```

### 3.2 Output Envelope Format
```json
{
  "success": true,
  "meta": {
    "district": "chattogram",
    "parameter": "PRECTOTCORR",
    "unit": "mm/day",
    "dataset_provenance": "nasa:power:daily:point",
    "time_standard": "LST",
    "formula_version": "v1.0.0-phase3",
    "years_used": 25,
    "total_observations": 9131,
    "valid_observations": 9131,
    "missing_observations": 0,
    "coverage_percent": 100.0,
    "limitations": "NASA POWER Local Solar Time (LST) observations. Gridded point interpolation resolution ~0.5 deg. Descriptive historical statistics only."
  },
  "data": { ... }
}
```

---

## 4. CLI Execution

```bash
# Full analysis across all parameters in snapshot:
python server/science/run.py summarize --district chattogram --input snapshot.json --output summary.json

# Filtered parameter analysis:
python server/science/run.py summarize --district cumilla --parameter PRECTOTCORR --input snapshot.json

# Stdin/stdout streaming:
cat snapshot.json | python server/science/run.py summarize --district chattogram --input -
```

---

## 5. Test Suite

Run Python scientific tests:
```bash
python -m unittest discover -s server/science/tests -p "test_*.py"
```
Covers:
1. Known-answer rainfall totals.
2. Known-answer temperature averages.
3. Percentile calculations (linear method).
4. Missing-value handling.
5. Sentinel handling (-999).
6. Incomplete month handling (<90% threshold).
7. Leap-year handling (Feb 29 vs Feb 28).
8. Coverage calculations.
9. Empty datasets handling.
10. Invalid input rejection.
11. District data isolation (Chattogram vs Cumilla).
12. Deterministic repeat calculations.
# Market price outlook

The `market-forecast` CLI fits an inspectable seasonal ridge regression to one
commodity, one price type, one unit, and one location series. It requires at
least 90 dated records spanning five years, uses a chronological holdout for
MAE/RMSE and an approximate 90% error band, then refits on all eligible records.
It does not infer farmer profit from retail prices. Profit analysis must use
farmer-entered yield and costs with a grower or wholesale quote.

Market records are imported separately from authenticated DAM or licensed
research source files. Each normalized JSON record has this shape:

```json
{
  "date": "2022-01-01",
  "commodity": "Green chilli",
  "division": "Dhaka",
  "district": "Dhaka",
  "market": "",
  "priceType": "wholesale",
  "unit": "BDT/kg",
  "priceMin": 60,
  "priceMax": 75,
  "source": "DAM daily market report",
  "sourceUrl": "https://market.dam.gov.bd/",
  "licence": "Government source",
  "qualityStatus": "review"
}
```

Import an array of records, or `{ "observations": [...] }`, using
`npm run import:market-prices -- path/to/normalized-market-prices.json` from
`krishi_server`. The importer upserts by commodity, location, type, unit, date,
and source. It accepts only DAM/Mendeley hosts; records default to `review` and
the forecast API reads only records explicitly marked `verified`. Review
extracted values and known anomalies before promoting a dataset to verified.
No verified historical DAM quote series is currently loaded in MongoDB. The
project ships a separate, explicitly labeled monthly World Bank reference
series (described below); it is never imported as a retail, wholesale, or
producer quote.

For a limited national pilot, download the five published AgriPriceBD CSV files
from [Mendeley Data](https://data.mendeley.com/datasets/bkmxnrn3hn/1) (CC BY 4.0),
then convert and import them:

```sh
python science/convert_agripricebd.py path/to/agripricebd-csvs data/market-prices.json
npm run import:market-prices -- data/market-prices.json
```

This research dataset contains national wholesale/retail series for garlic,
chickpea, green chilli, cucumber, and sweet pumpkin only. It is not a division-
level or grower-price history. Converted rows are `review` until their source
values are checked; therefore the forecast endpoint will not use them as-is.
The converter accepts both range columns and a mid-price `date,price` CSV;
mid-price-only files become retail observations.
For division-level grower comparisons, import reviewed DAM Growers/Wholesale
records through the same normalized schema.

## Multi-source market data and monthly reference forecasts

The market data pipeline keeps all price observations with their source,
frequency, unit, geography, and quality status. It never promotes a source to
verified simply because it can be parsed.

Local input files belong under `science/data/raw/` (this directory is ignored
by Git). The checked-in pipeline supports these archives:

- `BGD_RTFP_mkt_2007_YYYY-MM-DD.zip` — open World Bank Real Time Food Prices
  dataset. The fetcher reads the World Bank download index and selects the
  newest open Bangladesh market file.
- `Agricultural-Commodity-Price-Forecasting-in-Bangladesh-main.zip` — six
  weekly commodity files. The upstream README attributes them to DAM, but the
  supplied rows contain no location and the exact DAM report extracts were not
  included. These rows are normalized as review-only.
- `crop-price-prediction-dataset-tensymp2024.zip` — 6,612 weekly market rows
  from the TENSYMP dataset. Its bundled README limits use to academic and
  non-commercial research. It remains review-only and must not be used in a
  commercial product without rights.
- `bd-price-trend-archive.zip` — 50 dated Tk/kg values without a documented
  source, location, or price type. The audit records why it is excluded.

The named AgriPriceBD daily archive was not among the supplied files. If you
obtain the five CSV files from Mendeley Data, the existing
`convert_agripricebd.py` converter accepts them; they should still be reviewed
before import.

Install the declared dependencies and build the normalized evidence file:

```powershell
cd krishi_server
python -m venv science/.venv
science/.venv/Scripts/python.exe -m pip install -r science/requirements.txt
science/.venv/Scripts/python.exe science/fetch_worldbank_rtfp.py
science/.venv/Scripts/python.exe science/market_data_pipeline.py
science/.venv/Scripts/python.exe science/train_reference_models.py
```

Outputs:

- `science/data/processed/bangladesh_crop_prices.csv` — 128,972 normalized
  rows from the supplied snapshots and World Bank 2026-11-17 archive. This
  file is local-only because some included research data has restricted
  redistribution terms.
- `science/data/processed/market_data_audit.json` — actual row, crop, date,
  unit, location, duplicate, and invalid-price counts for each source.
- `science/data/reference/worldbank_reference_history.json.gz` — compact,
  attributed monthly national and division series derived from the open
  World Bank estimate dataset.
- `science/data/reference/worldbank_reference_forecasts.json` — one-month
  forecasts from the selected model for each eligible crop/area series.
- `science/data/processed/worldbank_reference_model_report.json` and
  `science/data/models/` — chronological model comparisons, metrics, model
  metadata, and local model artifacts.

The World Bank source version used in the initial import is 2026-11-17 and has
28,680 market-month rows for 119 markets plus a national average, with four
commodities: lentils (masur), palm oil, coarse rice, and wheat flour. The source
is updated weekly and mixes directly observed source inputs with modeled and
spatially interpolated estimates; records carry its trust and interpolation
fields. The returned “close” value is treated as a modeled reference point,
not a farmer quote. Monthly data supports a one-month-ahead backtest and
forecast only; it cannot support 7-, 15-, or 30-day daily forecasts.

The included GitHub Actions workflow checks the World Bank's public file list
daily at 02:00 Bangladesh time. It downloads only a new open dataset version,
rebuilds the monthly reference history and forecasts, and pushes changed
reference artifacts. The source itself updates weekly. No collector is enabled
for DAM: its public daily page exposes a filter form and print/PDF controls,
but no documented public API was found, so this project does not scrape it.
Farmers should continue to use the linked official daily report for today's
DAM prices until an authorized structured feed is available.

Public reference endpoints:

- `GET /api/v1/market/reference/catalog`
- `GET /api/v1/market/reference/series?cropId=rice-coarse&division=National`

These endpoints serve modeled monthly references only. Existing daily forecast
and margin APIs continue to require same-series verified observations.
