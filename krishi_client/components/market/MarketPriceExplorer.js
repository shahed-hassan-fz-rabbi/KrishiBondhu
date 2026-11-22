"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Search, Store } from "lucide-react";
import { MarketPriceChart } from "@/components/market/MarketPriceChart.js";
import MarketForecastPanel from "@/components/market/MarketForecastPanel.js";
import { filterObservationsByDate, filterVerifiedSeries, isObservationStale, locationKey, middleOfReportedRange, observationAgeDays, uniqueMarketLocations } from "@/lib/marketPresentation.js";
import { fetchVerifiedMarketPriceCatalog, fetchMarketPriceHistory } from "@/services/api.js";

const NOT_RECORDED = "__not_recorded__";
const labels = {
  en: {
    title: "Explore verified market observations", intro: "Search the verified price archive. Every series keeps its own price type, unit, frequency, source, and recorded location.", search: "Search crops", searchHint: "Search the commodity names present in the verified catalog.", priceType: "Price type", frequency: "Frequency", division: "Division", all: "All available", retail: "Retail", wholesale: "Wholesale", producer: "Producer", daily: "Daily", weekly: "Weekly", monthly: "Monthly", results: "Available verified series", noSeries: "No verified series match these filters.", loadingCatalog: "Loading verified price catalog…", catalogError: "The verified price catalog is unavailable. No sample quotes are shown.", noCatalog: "No verified price series are available yet.", sourceCount: "Sources", records: "Records", dates: "Observed dates", select: "View series", selected: "Selected price series", chooseSource: "Choose a source", chooseLocation: "Choose the exact location before viewing a price trend.", source: "Source", market: "Market", district: "District", upazila: "Upazila", none: "Not recorded in source", choose: "Choose…", onlyLocation: "Only one verified location is available for this series.", onlySource: "Only one verified source is available for this series.", loadingHistory: "Loading the selected verified history…", historyError: "History could not be loaded for this series.", noHistory: "No verified observations match this exact series and location.", ambiguous: "These filters still match multiple locations. Choose a more specific location before displaying a chart.", chartTitle: "Historical observed prices", low: "Reported low", high: "Reported high", lastPrice: "Latest in selected period", observed: "Observed", freshness: "Freshness", stale: "Stale by the market forecast freshness rule", age: "days old", current: "Today's verified observation", recent: "Latest available verified observation", dateFrom: "From date", dateTo: "To date", noDateRows: "No observations fall within this date range.", sourceMissing: "Source is not recorded", unit: "Unit", notRecorded: "Not recorded", categoryUnavailable: "The verified catalog does not provide commodity categories or a Bengali name field. Search uses the catalog commodity name as received.", demoWarning: "No demo price cards are used in this explorer.", provenance: "Source and observation details", sourceUrl: "Open source record", observationCount: "observations", selectSeries: "Choose a verified series to inspect its history.", locationSummary: "Selected exact location", dateRange: "Date range is applied to the returned series; the API does not provide a date-range query.", loadError: "Could not connect to market history.",
  },
  bn: {
    title: "যাচাইকৃত বাজার পর্যবেক্ষণ দেখুন", intro: "যাচাইকৃত দরের আর্কাইভে খুঁজুন। প্রতিটি সিরিজে দরের ধরন, একক, সময়কাল, উৎস ও নথিভুক্ত এলাকা আলাদা রাখা হয়েছে।", search: "ফসল খুঁজুন", searchHint: "যাচাইকৃত তালিকায় থাকা পণ্যের নাম দিয়ে খুঁজুন।", priceType: "দরের ধরন", frequency: "সময়কাল", division: "বিভাগ", all: "সব পাওয়া বিকল্প", retail: "খুচরা", wholesale: "পাইকারি", producer: "উৎপাদক", daily: "দৈনিক", weekly: "সাপ্তাহিক", monthly: "মাসিক", results: "যাচাইকৃত দরের সিরিজ", noSeries: "এই ফিল্টারে যাচাইকৃত সিরিজ পাওয়া যায়নি।", loadingCatalog: "যাচাইকৃত দরের তালিকা লোড হচ্ছে…", catalogError: "যাচাইকৃত দরের তালিকা পাওয়া যাচ্ছে না। নমুনা দর দেখানো হচ্ছে না।", noCatalog: "এখনো যাচাইকৃত দরের সিরিজ নেই।", sourceCount: "উৎস", records: "রেকর্ড", dates: "পর্যবেক্ষণের তারিখ", select: "সিরিজ দেখুন", selected: "নির্বাচিত দরের সিরিজ", chooseSource: "উৎস বেছে নিন", chooseLocation: "দরের ধারা দেখার আগে নির্দিষ্ট এলাকা বেছে নিন।", source: "উৎস", market: "বাজার", district: "জেলা", upazila: "উপজেলা", none: "উৎসে উল্লেখ নেই", choose: "বেছে নিন…", onlyLocation: "এই সিরিজে একটি যাচাইকৃত এলাকাই পাওয়া গেছে।", onlySource: "এই সিরিজে একটি যাচাইকৃত উৎসই পাওয়া গেছে।", loadingHistory: "নির্বাচিত যাচাইকৃত ইতিহাস লোড হচ্ছে…", historyError: "এই সিরিজের ইতিহাস লোড করা যায়নি।", noHistory: "এই সিরিজ ও নির্দিষ্ট এলাকার জন্য যাচাইকৃত পর্যবেক্ষণ নেই।", ambiguous: "এই ফিল্টারে একাধিক এলাকা মিলছে। চার্ট দেখার আগে নির্দিষ্ট এলাকা বেছে নিন।", chartTitle: "ঐতিহাসিক পর্যবেক্ষিত দর", low: "রিপোর্টের সর্বনিম্ন", high: "রিপোর্টের সর্বোচ্চ", lastPrice: "নির্বাচিত সময়ের সর্বশেষ দর", observed: "পর্যবেক্ষিত", freshness: "তথ্যের বয়স", stale: "বাজার পূর্বাভাসের সতেজতা নীতিতে পুরোনো", age: "দিন আগে", current: "আজকের যাচাইকৃত পর্যবেক্ষণ", recent: "সর্বশেষ পাওয়া যাচাইকৃত পর্যবেক্ষণ", dateFrom: "শুরুর তারিখ", dateTo: "শেষের তারিখ", noDateRows: "এই তারিখসীমায় কোনো পর্যবেক্ষণ নেই।", sourceMissing: "উৎস নথিভুক্ত নেই", unit: "একক", notRecorded: "উৎসে উল্লেখ নেই", categoryUnavailable: "যাচাইকৃত তালিকায় পণ্যের শ্রেণি বা বাংলায় নাম নেই। খোঁজে উৎসে থাকা পণ্যের নাম ব্যবহার করা হয়।", demoWarning: "এই অনুসন্ধানে কোনো নমুনা দর ব্যবহার করা হয় না।", provenance: "উৎস ও পর্যবেক্ষণের বিবরণ", sourceUrl: "উৎসের নথি খুলুন", observationCount: "টি পর্যবেক্ষণ", selectSeries: "ইতিহাস দেখতে একটি যাচাইকৃত সিরিজ বেছে নিন।", locationSummary: "নির্বাচিত নির্দিষ্ট এলাকা", dateRange: "তারিখসীমা পাওয়া সিরিজের ওপর প্রয়োগ করা হয়; API-তে তারিখসীমার ফিল্টার নেই।", loadError: "বাজার ইতিহাসের সাথে সংযোগ করা যায়নি।",
  },
};

const optionValue = (value) => value || NOT_RECORDED;
const exactValue = (value) => value === NOT_RECORDED ? "" : value;
const seriesId = (series) => [series.commodityKey, series.division, series.priceType, series.frequency, series.unit].join("|");

function locationMatches(location, filters) {
  return (!filters.division || location.division === exactValue(filters.division)) &&
    (!filters.district || location.district === exactValue(filters.district)) &&
    (!filters.upazila || location.upazila === exactValue(filters.upazila)) &&
    (!filters.market || location.market === exactValue(filters.market));
}

function SelectFilter({ label, value, options, onChange, text }) {
  if (!options.length) return null;
  return <label className="min-w-0 text-xs font-semibold text-[#526761]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="">{text.choose}</option>{options.map((item) => <option key={item} value={item}>{item === NOT_RECORDED ? text.none : item}</option>)}</select></label>;
}

export default function MarketPriceExplorer({ locale = "en" }) {
  const bn = locale === "bn";
  const text = labels[bn ? "bn" : "en"];
  const [catalogState, setCatalogState] = useState("loading");
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState("");
  const [priceType, setPriceType] = useState("");
  const [frequency, setFrequency] = useState("");
  const [division, setDivision] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [baselineState, setBaselineState] = useState("idle");
  const [baselineRows, setBaselineRows] = useState([]);
  const [baselineError, setBaselineError] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [locationFilters, setLocationFilters] = useState({ division: "", district: "", upazila: "", market: "" });
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [historyState, setHistoryState] = useState("idle");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    fetchVerifiedMarketPriceCatalog().then((response) => {
      if (!active) return;
      if (response?.success && Array.isArray(response.data?.series)) {
        setCatalog(response.data.series);
        setCatalogState(response.data.series.length ? "ready" : "empty");
      } else setCatalogState("unavailable");
    }).catch(() => { if (active) setCatalogState("unavailable"); });
    return () => { active = false; };
  }, []);

  const filteredSeries = useMemo(() => filterVerifiedSeries(catalog, { query, priceType, frequency, division }), [catalog, query, priceType, frequency, division]);
  const selectedSeries = useMemo(() => catalog.find((item) => seriesId(item) === selectedId) || null, [catalog, selectedId]);

  useEffect(() => {
    if (!selectedSeries) {
      // Reset dependent state when the user clears the selected series.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBaselineRows([]);
      setBaselineState("idle");
      setHistoryRows([]);
      setHistoryState("idle");
      return undefined;
    }
    let active = true;
    setBaselineState("loading");
    setBaselineError("");
    setBaselineRows([]);
    setHistoryRows([]);
    setHistoryState("idle");
    setSelectedSource("");
    setLocationFilters({ division: selectedSeries.division || "", district: "", upazila: "", market: "" });
    setRangeStart("");
    setRangeEnd("");
    fetchMarketPriceHistory({ commodity: selectedSeries.commodity, division: selectedSeries.division, priceType: selectedSeries.priceType, frequency: selectedSeries.frequency, unit: selectedSeries.unit }).then((response) => {
      if (!active) return;
      if (!response?.success || !Array.isArray(response.data?.observations) || response.data.observations.length === 0) {
        setBaselineState(response?.success ? "empty" : "unavailable");
        setBaselineError(response?.error?.message || "");
        return;
      }
      const rows = response.data.observations;
      setBaselineRows(rows);
      setBaselineState("ready");
      const sources = [...new Set(rows.map((row) => row.source).filter(Boolean))];
      const locations = uniqueMarketLocations(rows);
      if (sources.length === 1) setSelectedSource(sources[0]);
      if (sources.length === 1 && locations.length === 1) {
        const only = locations[0];
        setLocationFilters({ division: optionValue(only.division), district: optionValue(only.district), upazila: optionValue(only.upazila), market: optionValue(only.market) });
      }
    }).catch((error) => {
      if (active) {
        setBaselineState("unavailable");
        setBaselineError(error?.message || "");
      }
    });
    return () => { active = false; };
  }, [selectedSeries]);

  const sourceRows = useMemo(() => baselineRows.filter((row) => !selectedSource || row.source === selectedSource), [baselineRows, selectedSource]);
  const locations = useMemo(() => uniqueMarketLocations(sourceRows), [sourceRows]);
  const divisions = useMemo(() => [...new Set(locations.map((item) => optionValue(item.division)))].sort(), [locations]);
  const districts = useMemo(() => [...new Set(locations.filter((item) => !locationFilters.division || item.division === exactValue(locationFilters.division)).map((item) => optionValue(item.district)))].sort(), [locations, locationFilters.division]);
  const upazilas = useMemo(() => [...new Set(locations.filter((item) => (!locationFilters.division || item.division === exactValue(locationFilters.division)) && (!locationFilters.district || item.district === exactValue(locationFilters.district))).map((item) => optionValue(item.upazila)))].sort(), [locations, locationFilters.division, locationFilters.district]);
  const markets = useMemo(() => [...new Set(locations.filter((item) => (!locationFilters.division || item.division === exactValue(locationFilters.division)) && (!locationFilters.district || item.district === exactValue(locationFilters.district)) && (!locationFilters.upazila || item.upazila === exactValue(locationFilters.upazila))).map((item) => optionValue(item.market)))].sort(), [locations, locationFilters.division, locationFilters.district, locationFilters.upazila]);

  const matchingLocations = useMemo(() => locations.filter((item) => locationMatches(item, locationFilters)), [locations, locationFilters]);
  const selectedLocation = useMemo(() => matchingLocations.length === 1 ? matchingLocations[0] : null, [matchingLocations]);
  const locationComplete = Boolean(selectedLocation && locationFilters.division && locationFilters.district && locationFilters.upazila && locationFilters.market);

  useEffect(() => {
    if (!selectedSeries || !selectedSource || !locationComplete || !selectedLocation) {
      // Clear history when the selection no longer identifies one exact series.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistoryRows([]);
      setHistoryState("idle");
      return undefined;
    }
    let active = true;
    setHistoryState("loading");
    setHistoryRows([]);
    setHistoryError("");
    fetchMarketPriceHistory({
      commodity: selectedSeries.commodity,
      division: selectedLocation.division,
      district: selectedLocation.district || undefined,
      upazila: selectedLocation.upazila || undefined,
      market: selectedLocation.market || undefined,
      priceType: selectedSeries.priceType,
      frequency: selectedSeries.frequency,
      unit: selectedSeries.unit,
      source: selectedSource,
    }).then((response) => {
      if (!active) return;
      if (!response?.success || !Array.isArray(response.data?.observations)) {
        setHistoryState(response?.success ? "empty" : "unavailable");
        setHistoryError(response?.error?.message || "");
        return;
      }
      const exactRows = response.data.observations.filter((row) => locationKey(row) === selectedLocation.key && row.source === selectedSource && row.unit === selectedSeries.unit);
      const exactLocations = uniqueMarketLocations(exactRows);
      if (exactLocations.length !== 1) {
        setHistoryRows([]);
        setHistoryState(exactLocations.length ? "ambiguous" : "empty");
        return;
      }
      setHistoryRows(exactRows);
      setHistoryState(exactRows.length ? "ready" : "empty");
    }).catch((error) => {
      if (active) {
        setHistoryState("unavailable");
        setHistoryError(error?.message || "");
      }
    });
    return () => { active = false; };
  }, [selectedSeries, selectedLocation, selectedSource, locationComplete]);

  const selectedRows = useMemo(() => filterObservationsByDate(historyRows, rangeStart, rangeEnd), [historyRows, rangeStart, rangeEnd]);
  const latest = selectedRows.at(-1) || null;
  const selectedSourceOptions = [...new Set(baselineRows.map((row) => row.source).filter(Boolean))].sort();
  // The observation date is compared with Bangladesh's current calendar date.
  // eslint-disable-next-line react-hooks/purity
  const currentObservation = latest && String(latest.observedOn).slice(0, 10) === new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const stale = latest ? isObservationStale(latest.observedOn, selectedSeries?.frequency) : false;

  const updateLocation = (field, value) => {
    const order = ["division", "district", "upazila", "market"];
    const index = order.indexOf(field);
    setLocationFilters((previous) => ({
      ...previous,
      [field]: value,
      ...Object.fromEntries(order.slice(index + 1).map((child) => [child, ""])),
    }));
  };

  return <section aria-labelledby="market-explorer-heading" className="space-y-5 rounded-3xl border border-[#e4e3d9] bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#247a4b]">{bn ? "যাচাইকৃত বাজার আর্কাইভ" : "VERIFIED MARKET ARCHIVE"}</p><h2 id="market-explorer-heading" className="mt-1 text-xl font-bold tracking-tight text-[#173b2a] sm:text-2xl">{text.title}</h2><p className="mt-2 text-sm leading-6 text-[#5f6c62]">{text.intro}</p></div><span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#c8dfc9] bg-[#e8f2e9] px-3 text-xs font-semibold text-[#247a4b]"><Store className="h-4 w-4" aria-hidden="true" />{bn ? "শুধু যাচাইকৃত রেকর্ড" : "Verified records only"}</span></div>

    <div className="grid gap-3 rounded-2xl bg-[#f8f7f2] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.6fr)_repeat(3,minmax(140px,1fr))] sm:p-4">
      <label className="min-w-0 text-xs font-semibold text-[#526761]">{text.search}<span className="relative mt-1 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#738074]" aria-hidden="true"/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchHint} className="min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white py-2 pl-9 pr-3 text-sm text-[#173b2a] placeholder:text-[#758176]" /></span></label>
      <label className="text-xs font-semibold text-[#526761]">{text.priceType}<select value={priceType} onChange={(event) => setPriceType(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="">{text.all}</option>{["retail", "wholesale", "producer"].map((item) => <option key={item} value={item}>{text[item]}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#526761]">{text.frequency}<select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="">{text.all}</option>{["daily", "weekly", "monthly"].map((item) => <option key={item} value={item}>{text[item]}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#526761]">{text.division}<select value={division} onChange={(event) => setDivision(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="">{text.all}</option>{[...new Set(catalog.map((item) => item.division).filter(Boolean))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>

    {catalogState === "loading" ? <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-[#e8eee6]" />)}<span className="sr-only">{text.loadingCatalog}</span></div>
      : catalogState === "unavailable" ? <div role="status" className="rounded-2xl border border-dashed border-[#d5d5c9] bg-[#faf9f5] p-5 text-sm text-[#58665c]">{text.catalogError}</div>
        : catalogState === "empty" ? <div role="status" className="rounded-2xl border border-dashed border-[#d5d5c9] bg-[#faf9f5] p-5 text-sm text-[#58665c]">{text.noCatalog}</div>
          : <>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold text-[#173b2a]">{text.results}</h3><span className="text-xs text-[#667268]">{filteredSeries.length} {bn ? "টি সিরিজ" : "series"}</span></div>
            {filteredSeries.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSeries.slice(0, 36).map((item) => {
                const key = seriesId(item);
                const selected = selectedId === key;
                return <article key={key} className={`min-w-0 rounded-2xl border p-4 transition duration-150 motion-reduce:transition-none ${selected ? "border-[#247a4b] bg-[#e8f2e9] shadow-sm" : "border-[#e4e3d9] bg-[#fbfaf6] hover:-translate-y-0.5 hover:border-[#bdd5bf] hover:shadow-sm"}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate font-semibold text-[#173b2a]" title={item.commodity}>{item.commodity}</h4><p className="mt-1 text-xs text-[#667268]">{item.division} · {text[item.priceType] || item.priceType} · {text[item.frequency] || item.frequency}</p></div><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#526761]">{item.unit}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#667268]"><span>{item.records} {text.observationCount}</span><span>·</span><span>{item.lastObservedOn || "—"}</span></div>
                  <button type="button" onClick={() => setSelectedId(key)} aria-pressed={selected} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#123d2a] px-3 text-sm font-semibold text-white transition hover:bg-[#0c3322] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247a4b]">{selected ? text.selected : text.select}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                </article>;
              })}
            </div> : <div role="status" className="rounded-2xl border border-dashed border-[#d5d5c9] bg-[#faf9f5] p-5 text-sm text-[#58665c]">{text.noSeries}</div>}
            <p className="text-xs leading-5 text-[#667268]">{text.categoryUnavailable}</p>
          </>}

    {selectedSeries ? <div className="space-y-4 rounded-2xl border border-[#dce5d9] bg-[#f8faf6] p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#247a4b]">{text.selected}</p><h3 className="mt-1 text-lg font-semibold text-[#173b2a]">{selectedSeries.commodity}</h3><p className="mt-1 text-sm text-[#626e64]">{selectedSeries.division} · {text[selectedSeries.priceType] || selectedSeries.priceType} · {text[selectedSeries.frequency] || selectedSeries.frequency} · {selectedSeries.unit}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-[#526761]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{selectedSeries.records} {text.observationCount}</span></div>
      {baselineState === "loading" ? <p role="status" className="animate-pulse rounded-xl bg-white p-4 text-sm text-[#626e64]">{text.loadingHistory}</p>
        : baselineState === "unavailable" || baselineState === "empty" ? <p role="status" className="rounded-xl border border-dashed border-[#d5d5c9] bg-white p-4 text-sm text-[#626e64]">{baselineError || text.noHistory}</p>
          : baselineState === "ready" ? <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-[#526761]">{text.source}<select value={selectedSource} onChange={(event) => { setSelectedSource(event.target.value); setLocationFilters((value) => ({ ...value, district: "", upazila: "", market: "" })); }} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="">{text.chooseSource}</option>{selectedSourceOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>{selectedSourceOptions.length === 1 ? <span className="mt-1 block text-[11px] font-normal text-[#667268]">{text.onlySource}</span> : null}</label>
              <SelectFilter label={text.division} value={locationFilters.division} options={divisions} onChange={(value) => updateLocation("division", value)} text={text} />
              <SelectFilter label={text.district} value={locationFilters.district} options={districts} onChange={(value) => updateLocation("district", value)} text={text} />
              <SelectFilter label={text.upazila} value={locationFilters.upazila} options={upazilas} onChange={(value) => updateLocation("upazila", value)} text={text} />
              <SelectFilter label={text.market} value={locationFilters.market} options={markets} onChange={(value) => updateLocation("market", value)} text={text} />
              {selectedSourceOptions.length === 1 && locations.length === 1 ? <p className="self-end rounded-xl bg-white px-3 py-3 text-xs text-[#526761]">{text.onlyLocation}</p> : null}
            </div>
            {!selectedSource || !selectedLocation ? <p role="status" className="rounded-xl border border-dashed border-[#d5d5c9] bg-white p-4 text-sm text-[#626e64]">{text.chooseLocation}</p> : selectedLocation ? <>
              <div className="rounded-xl border border-[#dce5d9] bg-white p-3"><p className="text-xs font-semibold text-[#247a4b]">{text.locationSummary}</p><p className="mt-1 text-sm text-[#173b2a]">{[selectedLocation.market, selectedLocation.upazila, selectedLocation.district, selectedLocation.division].filter(Boolean).join(" · ")}</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#526761]">{text.dateFrom}<input type="date" max={rangeEnd || undefined} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]" /></label><label className="text-xs font-semibold text-[#526761]">{text.dateTo}<input type="date" min={rangeStart || undefined} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]" /></label></div>
              <p className="text-[11px] leading-5 text-[#667268]">{text.dateRange}</p>
              {historyState === "loading" ? <div role="status" className="h-56 animate-pulse rounded-xl bg-[#e8eee6]" />
                : historyState === "unavailable" || historyState === "empty" || historyState === "ambiguous" ? <p role="status" className="rounded-xl border border-dashed border-[#d5d5c9] bg-white p-4 text-sm text-[#626e64]">{historyError || (historyState === "ambiguous" ? text.ambiguous : historyState === "unavailable" ? text.loadError : text.noHistory)}</p>
                  : selectedRows.length ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,.8fr)]">
                    <figure className="min-w-0 rounded-xl border border-[#e4e3d9] bg-white p-3 sm:p-4"><figcaption className="mb-1"><h4 className="font-semibold text-[#173b2a]">{text.chartTitle}</h4><p className="mt-1 text-xs text-[#667268]">{selectedSeries.commodity} · {selectedLocation.market || selectedLocation.division} · {selectedSeries.unit} · {selectedSeries.frequency}</p></figcaption><MarketPriceChart data={selectedRows} locale={locale} title={text.chartTitle} /></figure>
                    <aside className="space-y-3"><article className="rounded-xl border border-[#e4e3d9] bg-white p-4"><p className="text-xs font-semibold text-[#667268]">{currentObservation && !stale ? text.current : text.lastPrice}</p><strong className="mt-1 block text-2xl text-[#173b2a]">৳{new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(middleOfReportedRange(latest))} <span className="text-sm font-normal">/ {latest.unit}</span></strong><p className="mt-1 text-xs text-[#667268]">{text.observed}: {latest.observedOn}</p><p className="mt-1 text-xs text-[#667268]">{latest.source || text.sourceMissing}</p><p className={`mt-2 text-xs ${stale ? "font-semibold text-[#875d20]" : "text-[#667268]"}`}>{text.freshness}: {observationAgeDays(latest.observedOn)} {text.age}{stale ? ` · ${text.stale}` : ""}</p><p className="mt-2 text-xs text-[#667268]">{text.low}: ৳{new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(latest.priceMin)} · {text.high}: ৳{new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(latest.priceMax)}</p></article>
                      <details className="rounded-xl border border-[#e4e3d9] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#173b2a]">{text.provenance}</summary><dl className="mt-3 space-y-2 text-xs text-[#667268]"><div><dt className="inline font-semibold">{text.source}: </dt><dd className="inline">{latest.source || text.notRecorded}</dd></div><div><dt className="inline font-semibold">{text.observed}: </dt><dd className="inline">{latest.observedOn}</dd></div><div><dt className="inline font-semibold">{text.locationSummary}: </dt><dd className="inline">{[latest.market, latest.upazila, latest.district, latest.division].filter(Boolean).join(" · ") || text.notRecorded}</dd></div><div><dt className="inline font-semibold">{text.priceType}: </dt><dd className="inline">{text[selectedSeries.priceType] || selectedSeries.priceType}</dd></div><div><dt className="inline font-semibold">{text.unit}: </dt><dd className="inline">{latest.unit}</dd></div><div><dt className="inline font-semibold">{text.frequency}: </dt><dd className="inline">{text[selectedSeries.frequency] || selectedSeries.frequency}</dd></div></dl>{latest.sourceUrl ? <a className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-[#247a4b] underline" href={latest.sourceUrl} target="_blank" rel="noreferrer">{text.sourceUrl}</a> : null}</details>
                    </aside>
                  </div> : <p role="status" className="rounded-xl border border-dashed border-[#d5d5c9] bg-white p-4 text-sm text-[#626e64]">{historyRows.length ? text.noDateRows : text.noHistory}</p>}
            </> : null}
          </> : null}
      </div>
      : null}
    {selectedSeries ? <MarketForecastPanel series={selectedSource ? { ...selectedSeries, source: selectedSource } : selectedSeries} location={locationComplete ? selectedLocation : null} locale={locale} /> : null}
  </section>;
}
