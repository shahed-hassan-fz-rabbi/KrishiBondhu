export const MARKET_DIVISIONS = ["Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Sylhet", "Mymensingh", "National"];
export const MARKET_FREQUENCIES = ["daily", "weekly", "monthly"];
export const MARKET_PRICE_TYPES = ["producer", "wholesale", "retail"];

export function filterVerifiedSeries(series, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  return (Array.isArray(series) ? series : []).filter((item) =>
    (!query || String(item.commodity || "").toLocaleLowerCase().includes(query)) &&
    (!filters.priceType || item.priceType === filters.priceType) &&
    (!filters.frequency || item.frequency === filters.frequency) &&
    (!filters.division || item.division === filters.division)
  );
}

export function locationKey(observation) {
  return [observation?.division, observation?.district, observation?.upazila, observation?.market]
    .map((value) => String(value || "").trim())
    .join("\u001f");
}

export function uniqueMarketLocations(observations) {
  const locations = new Map();
  for (const observation of Array.isArray(observations) ? observations : []) {
    const key = locationKey(observation);
    if (!locations.has(key)) {
      locations.set(key, {
        key,
        division: observation.division || "",
        district: observation.district || "",
        upazila: observation.upazila || "",
        market: observation.market || "",
      });
    }
  }
  return [...locations.values()].sort((a, b) => [a.division, a.district, a.upazila, a.market].join(" ").localeCompare([b.division, b.district, b.upazila, b.market].join(" ")));
}

export function filterObservationsByDate(observations, from = "", to = "") {
  return (Array.isArray(observations) ? observations : []).filter((row) => {
    const day = String(row.observedOn || "").slice(0, 10);
    return Boolean(day) && (!from || day >= from) && (!to || day <= to);
  });
}

export function observationAgeDays(observedOn, now = Date.now()) {
  const time = Date.parse(`${String(observedOn || "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : null;
}

export function isObservationStale(observedOn, frequency, now = Date.now()) {
  const age = observationAgeDays(observedOn, now);
  const maxAge = { daily: 7, weekly: 35, monthly: 100 }[frequency];
  return age === null || maxAge === undefined || age > maxAge;
}

export function middleOfReportedRange(row) {
  return Number.isFinite(Number(row?.priceMin)) && Number.isFinite(Number(row?.priceMax))
    ? (Number(row.priceMin) + Number(row.priceMax)) / 2
    : null;
}
