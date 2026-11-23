/**
 * KrishiBondhu — Market Price SMS Alert policy (Part 3C.2).
 *
 * Data boundary (see science/MARKET_DATA_STATUS.md):
 *  - Only administrator-verified DAM/Ministry of Agriculture observations
 *    (`qualityStatus: "verified"` + an official HTTPS source URL) are real
 *    current market quotes. They are the ONLY input to this alert engine.
 *  - World Bank RTFP rows are monthly MODELED reference estimates.
 *  - AgriPriceBD is a historical daily archive ending June 2025.
 *  - IEEE / forecasting-repository / price-trend rows are research/review only.
 *  - On-demand forecast outputs are MODELED projections, not observations.
 *  None of these may be treated as a live price or used to trigger an alert.
 *
 * Freshness limits below are reused verbatim from the existing market data
 * status and forecast controllers (daily 7, weekly 35, monthly 100 days).
 *
 * Change thresholds are a LOCAL alerting policy, not an official DAM/BMD
 * classification: they are explicit and configurable, and no alert is sent
 * when the underlying source or history is uncertain.
 */

export const OFFICIAL_MARKET_SOURCE_HOSTS = Object.freeze([
  "dam.gov.bd",
  "www.dam.gov.bd",
  "market.dam.gov.bd",
  "service.moa.gov.bd",
]);

export const MARKET_ALERT_POLICY = Object.freeze({
  maxObservationAgeDays: Object.freeze({ daily: 7, weekly: 35, monthly: 100 }),
  minObservations: 2,
  // A move is "meaningful" only when BOTH conditions hold. These are local
  // noise filters, deliberately conservative, and overridable per call.
  minChangePercent: 10,
  minAbsoluteChange: 2, // in the observation's own unit (e.g. BDT/kg)
});

/** Local, documented defaults; callers may pass a partial override. */
export function resolveMarketAlertThresholds(override = {}) {
  return {
    maxObservationAgeDays: {
      ...MARKET_ALERT_POLICY.maxObservationAgeDays,
      ...(override.maxObservationAgeDays || {}),
    },
    minObservations: Number.isFinite(override.minObservations)
      ? override.minObservations
      : MARKET_ALERT_POLICY.minObservations,
    minChangePercent: Number.isFinite(override.minChangePercent)
      ? override.minChangePercent
      : MARKET_ALERT_POLICY.minChangePercent,
    minAbsoluteChange: Number.isFinite(override.minAbsoluteChange)
      ? override.minAbsoluteChange
      : MARKET_ALERT_POLICY.minAbsoluteChange,
  };
}
