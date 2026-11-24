"use client";

import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity, Check, CloudRain, Compass, Info, Layers, Leaf,
  LoaderCircle, MapPin, RefreshCw, Search, Thermometer, Waves,
} from "lucide-react";
import { LoadingState, ErrorState } from "@/components/ui/States.js";
import { useLocation } from "@/contexts/LocationContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { DISTRICT_UPAZILAS } from "@/lib/upazilas.js";
import {
  fetchGisBoundaries,
  fetchGisLayers,
  fetchGisUpazilas,
  fetchWeatherForecast,
} from "@/services/api.js";

const DynamicGisMap = dynamic(() => import("@/components/map/DistrictGisMap.js"), {
  ssr: false,
  loading: () => <div className="flex h-[520px] items-center justify-center rounded-3xl border border-line bg-surface-2"><LoadingState message="মানচিত্র লোড হচ্ছে... (Loading map)" /></div>,
});

const INITIAL_LAYERS = { boundary: true, gpm: true, smap: true, modis: true, climate: true, weatherForecast: true, footprints: true, upazilas: true };

function localizeNumber(value, locale) {
  const text = value == null || value === "" ? "—" : String(value);
  return locale === "bn" ? text.replace(/[0-9]/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]) : text;
}

function mapRegisteredUpazila(feature, districtCode) {
  const aliases = { anowara: "anwara", manoharganj: "monohargonj" };
  const normalize = value => {
    let normalized = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
    normalized = normalized.replace(/^comilla/, "").replace(/^chittagong/, "");
    return aliases[normalized] || normalized;
  };
  const sourceName = feature?.properties?.shapeName || "";
  const match = (DISTRICT_UPAZILAS[districtCode] || []).find(item => normalize(item.nameEn) === normalize(sourceName));
  return match ? { ...feature, properties: { ...feature.properties, displayNameEn: match.nameEn, displayNameBn: match.nameBn } } : null;
}

function LayerToggle({ active, onClick, icon: Icon, children, tone = "emerald" }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    blue: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    teal: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
    green: "border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-800 dark:bg-lime-950/40 dark:text-lime-200",
    orange: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    violet: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  };
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${active ? tones[tone] : "border-line bg-surface text-ink-muted hover:bg-surface-2"}`}>
    {active ? <Check size={14} aria-hidden="true" /> : <span className="h-3.5 w-3.5" />}
    {Icon && <Icon size={15} aria-hidden="true" />}
    <span>{children}</span>
  </button>;
}

function ReadingCard({ icon: Icon, title, value, meta, note, tone = "emerald", loading = false }) {
  const colors = {
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white dark:border-emerald-900 dark:from-emerald-950/30 dark:to-surface",
    blue: "border-sky-200 bg-gradient-to-br from-sky-50/80 to-white dark:border-sky-900 dark:from-sky-950/30 dark:to-surface",
    teal: "border-teal-200 bg-gradient-to-br from-teal-50/80 to-white dark:border-teal-900 dark:from-teal-950/30 dark:to-surface",
    lime: "border-lime-200 bg-gradient-to-br from-lime-50/80 to-white dark:border-lime-900 dark:from-lime-950/30 dark:to-surface",
    orange: "border-orange-200 bg-gradient-to-br from-orange-50/80 to-white dark:border-orange-900 dark:from-orange-950/30 dark:to-surface",
  };
  return <article className={`min-w-0 rounded-2xl border p-4 shadow-xs ${colors[tone]}`}>
    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon size={17} className="text-emerald" aria-hidden="true" />{title}</div>
    <p className="mt-3 break-words text-xl font-bold tracking-tight text-forest dark:text-emerald-100">{loading ? <LoaderCircle className="animate-spin" size={20} /> : value}</p>
    {meta && <p className="mt-1 text-xs font-medium text-ink-muted">{meta}</p>}
    {note && <p className="mt-2 text-xs leading-5 text-ink-muted">{note}</p>}
  </article>;
}

function MapPage() {
  const { locale } = useLang();
  const { selectedDistrict, setSelectedDistrict, districts, currentDistrictObj } = useLocation();
  const isBn = locale === "bn";
  const [layersData, setLayersData] = useState(null);
  const [boundaryData, setBoundaryData] = useState(null);
  const [upazilaData, setUpazilaData] = useState(null);
  const [upazilaCatalog, setUpazilaCatalog] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upazilaError, setUpazilaError] = useState(null);
  const [activeLayers, setActiveLayers] = useState(INITIAL_LAYERS);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedUpazila, setSelectedUpazila] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const mapRequestRef = useRef(0);
  const forecastRequestRef = useRef(0);

  const loadMapData = useCallback(async (districtCode) => {
    const requestId = ++mapRequestRef.current;
    setLoading(true);
    setError(null);
    setUpazilaError(null);
    try {
      const [layerRes, boundaryRes, upazilaRes] = await Promise.all([
        fetchGisLayers(districtCode),
        fetchGisBoundaries(districtCode),
        fetchGisUpazilas(districtCode),
      ]);
      if (!layerRes?.success) throw new Error(layerRes?.error?.message || layerRes?.message || "Failed to load environmental readings");
      if (requestId !== mapRequestRef.current) return;
      setLayersData(layerRes.data);
      setBoundaryData(boundaryRes?.success ? boundaryRes.data : null);
      setUpazilaData(upazilaRes?.success ? upazilaRes.data : null);
      if (upazilaRes?.success) setUpazilaCatalog(previous => ({ ...previous, [districtCode]: upazilaRes.data }));
      if (!upazilaRes?.success) setUpazilaError(upazilaRes?.error?.message || (isBn ? "উপজেলার সীমানা পাওয়া যায়নি" : "Upazila boundaries are unavailable"));

      const center = layerRes.data?.district?.center;
      if (Array.isArray(center) && center.length === 2) {
        setSelectedLocation(previous => previous?.districtCode === districtCode ? previous : {
          latitude: center[0], longitude: center[1],
          name: isBn ? layerRes.data.district.nameBn : layerRes.data.district.nameEn,
          districtCode, representative: true,
        });
      }
    } catch (err) {
      if (requestId === mapRequestRef.current) setError(err?.message || (isBn ? "মানচিত্রের তথ্য লোড করা যায়নি" : "Could not load map data"));
    } finally {
      if (requestId === mapRequestRef.current) setLoading(false);
    }
  }, [isBn]);

  useEffect(() => {
    if (selectedDistrict) loadMapData(selectedDistrict);
  }, [selectedDistrict, loadMapData]);

  useEffect(() => {
    const otherDistricts = districts.filter(district => district.code !== selectedDistrict && !upazilaCatalog[district.code]);
    if (!otherDistricts.length) return undefined;
    let cancelled = false;
    Promise.all(otherDistricts.map(async district => [district.code, await fetchGisUpazilas(district.code)]))
      .then(results => {
        if (cancelled) return;
        setUpazilaCatalog(previous => results.reduce((catalog, [code, response]) => {
          if (response?.success && response.data) catalog[code] = response.data;
          return catalog;
        }, { ...previous }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [districts, selectedDistrict, upazilaCatalog]);

  useEffect(() => () => { mapRequestRef.current += 1; forecastRequestRef.current += 1; }, []);

  useEffect(() => {
    if (!selectedLocation) return undefined;
    const requestId = ++forecastRequestRef.current;
    let cancelled = false;
    setForecastLoading(true);
    setForecastError(null);
    fetchWeatherForecast({ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude })
      .then(result => {
        if (cancelled || requestId !== forecastRequestRef.current) return;
        if (!result?.success || !result.data) throw new Error(result?.message || (isBn ? "আবহাওয়ার পূর্বাভাস পাওয়া যায়নি" : "Forecast is unavailable"));
        setForecast(result.data);
      })
      .catch(err => {
        if (!cancelled && requestId === forecastRequestRef.current) {
          setForecast(null);
          setForecastError(err?.message || (isBn ? "পূর্বাভাস লোড করা যায়নি" : "Could not load forecast"));
        }
      })
      .finally(() => { if (!cancelled && requestId === forecastRequestRef.current) setForecastLoading(false); });
    return () => { cancelled = true; };
  }, [selectedLocation, isBn]);

  const toggleLayer = key => setActiveLayers(previous => ({ ...previous, [key]: !previous[key] }));
  const upazilas = useMemo(() => {
    return (upazilaData?.features || []).map(feature => mapRegisteredUpazila(feature, selectedDistrict)).filter(Boolean);
  }, [upazilaData, selectedDistrict]);
  const visibleUpazilaData = useMemo(() => ({ type: "FeatureCollection", features: upazilas }), [upazilas]);
  const locationChoices = useMemo(() => {
    const districtChoices = districts.map(district => ({
      type: "district", id: `district:${district.code}`, districtCode: district.code,
      nameEn: district.nameEn, nameBn: district.nameBn, name: isBn ? district.nameBn : district.nameEn,
    }));
    const upazilaChoices = Object.entries(upazilaCatalog).flatMap(([districtCode, data]) =>
      (data?.features || []).map(sourceFeature => mapRegisteredUpazila(sourceFeature, districtCode)).filter(Boolean).map(feature => {
        const shapeName = feature.properties?.shapeName || "";
        const displayNameEn = feature.properties?.displayNameEn || shapeName;
        const displayNameBn = feature.properties?.displayNameBn || shapeName;
        return {
          type: "upazila", id: `upazila:${districtCode}:${feature.properties?.shapeID || shapeName}`,
          districtCode, feature,
          nameEn: displayNameEn, nameBn: displayNameBn,
          name: isBn ? displayNameBn : displayNameEn,
        };
      })
    );
    return [...districtChoices, ...upazilaChoices];
  }, [districts, isBn, upazilaCatalog]);
  const filteredChoices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return locationChoices.slice(0, 7);
    return locationChoices.filter(choice => `${choice.nameEn} ${choice.nameBn}`.toLocaleLowerCase().includes(normalized)).slice(0, 8);
  }, [locationChoices, query]);

  const selectChoice = choice => {
    setQuery("");
    setShowSuggestions(false);
    if (choice.type === "district") {
      setSelectedUpazila(null);
      setSelectedLocation(null);
      setSelectedDistrict(choice.districtCode);
      return;
    }
    const point = choice.feature?.properties?.representativePoint;
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
    setSelectedUpazila(choice.feature);
    setSelectedLocation({ ...point, name: choice.name, districtCode: choice.districtCode, representative: true });
    if (choice.districtCode !== selectedDistrict) setSelectedDistrict(choice.districtCode);
  };

  const handleMapLocationSelect = point => {
    setSelectedUpazila(null);
    setSelectedLocation({ latitude: point.latitude, longitude: point.longitude, name: isBn ? "মানচিত্রে নির্বাচিত স্থান" : "Selected map point", districtCode: selectedDistrict, representative: false });
  };

  const display = value => localizeNumber(value, locale);
  const sensors = layersData?.sensors || {};
  const rainfall = sensors.precipitation?.observation?.dailySummary;
  const soil = sensors.soilMoisture?.observation;
  const vegetation = sensors.vegetation?.observation;
  const climate = sensors.climate?.observations || {};
  const current = forecast?.currentConditions;
  const today = forecast?.shortRangeForecast?.[0];
  const districtLabel = isBn ? (layersData?.district?.nameBn || currentDistrictObj?.nameBn) : (layersData?.district?.nameEn || currentDistrictObj?.nameEn);
  const timestamp = forecast?.meta?.fetchTimestamp ? new Date(forecast.meta.fetchTimestamp).toLocaleString(isBn ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : null;
  const choiceTypeText = choice => choice.type === "district" ? (isBn ? "জেলা" : "District") : (isBn ? "উপজেলা" : "Upazila");

  return <div className="mx-auto max-w-[1600px] space-y-5 p-3 sm:p-5 lg:p-6">
    <header className="flex flex-col gap-4 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-emerald-900 dark:from-emerald-950/40 dark:via-surface dark:to-sky-950/30">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-surface dark:text-emerald-200"><Activity size={14} />{isBn ? "কৃষি পরিবেশ মানচিত্র" : "Agricultural environmental map"}</div>
        <h1 data-tour-target="map.overview" className="mt-3 font-heading text-2xl font-bold tracking-tight text-forest sm:text-3xl dark:text-emerald-100">{isBn ? "আপনার এলাকার আবহাওয়া ও পরিবেশ দেখুন" : "Explore local weather and environmental conditions"}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{isBn ? "জেলা বা উপজেলা খুঁজুন, অথবা মানচিত্রে চাপ দিয়ে একটি স্থান বেছে নিন। পূর্বাভাস, রেকর্ড ও উপগ্রহ তথ্য আলাদা করে দেখানো হয়।" : "Search a district or upazila, or tap the map to choose a point. Forecasts, recorded observations, and satellite data are kept clearly separate."}</p>
      </div>
      <button type="button" onClick={() => loadMapData(selectedDistrict)} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink shadow-xs transition hover:border-emerald hover:bg-surface-2 disabled:opacity-60" title={isBn ? "উপাত্ত আবার লোড করুন" : "Reload data"}>
        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />{isBn ? "তথ্য হালনাগাদ" : "Refresh data"}
      </button>
    </header>

    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative min-w-0 flex-1">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input value={query} onChange={event => { setQuery(event.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)} onKeyDown={event => { if (event.key === "Enter" && filteredChoices[0]) { event.preventDefault(); selectChoice(filteredChoices[0]); } if (event.key === "Escape") setShowSuggestions(false); }} role="combobox" aria-expanded={showSuggestions && filteredChoices.length > 0} aria-controls="gis-location-options" aria-autocomplete="list" placeholder={isBn ? "জেলা বা উপজেলা খুঁজুন..." : "Search district or upazila..."} className="h-12 w-full rounded-xl border border-line bg-bg/80 pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-muted/80 focus:border-emerald focus:ring-2 focus:ring-emerald/20" />
            {showSuggestions && filteredChoices.length > 0 && <div id="gis-location-options" role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-[1100] max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
              {filteredChoices.map(choice => <button key={choice.id} type="button" role="option" aria-selected="false" onMouseDown={event => event.preventDefault()} onClick={() => selectChoice(choice)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none dark:hover:bg-emerald-950/40 dark:focus:bg-emerald-950/40">
                <MapPin size={16} className="shrink-0 text-emerald" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{choice.name}</span><span className="text-[11px] text-ink-muted">{choiceTypeText(choice)}</span>
              </button>)}
            </div>}
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><MapPin size={15} />{selectedLocation?.name || districtLabel || (isBn ? "স্থান নির্বাচন করুন" : "Choose a location")}</div>
        </div>

        {error ? <div className="p-5"><ErrorState message={error} onRetry={() => loadMapData(selectedDistrict)} /></div> : <div className="p-2 sm:p-3">
          <DynamicGisMap
            boundaryData={boundaryData}
            upazilaData={visibleUpazilaData}
            selectedUpazila={selectedUpazila}
            selectedLocation={selectedLocation}
            layersData={layersData}
            activeLayers={activeLayers}
            onLocationSelect={handleMapLocationSelect}
            isBn={isBn}
          />
        </div>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />{isBn ? "আবহাওয়ার পূর্বাভাস" : "Weather forecast"}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />{isBn ? "উপগ্রহ পর্যবেক্ষণ" : "Satellite observation"}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-emerald-800 bg-emerald-300/30" />{isBn ? "প্রশাসনিক সীমানা" : "Administrative boundary"}</span>
          <span className="ml-auto">{isBn ? "সীমানা: BBS/OCHA ২০২০ · বেসম্যাপ: OpenStreetMap" : "Boundaries: BBS/OCHA 2020 · Basemap: OpenStreetMap"}</span>
        </div>
        {upazilaError && <p role="status" className="border-t border-line px-4 py-2 text-xs text-amber-800 dark:text-amber-200">{upazilaError}</p>}
      </div>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-5" aria-label={isBn ? "মানচিত্রের স্তর" : "Map layers"}>
          <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"><Layers size={17} /></span><div><h2 className="text-sm font-bold text-ink">{isBn ? "মানচিত্রের স্তর" : "Map layers"}</h2><p className="text-xs text-ink-muted">{isBn ? "দেখতে স্তর চালু বা বন্ধ করুন" : "Turn a layer on or off"}</p></div></div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <LayerToggle active={activeLayers.boundary} onClick={() => toggleLayer("boundary")} icon={Compass}>{isBn ? "জেলা সীমানা" : "District boundary"}</LayerToggle>
            <LayerToggle active={activeLayers.upazilas} onClick={() => toggleLayer("upazilas")} icon={MapPin}>{isBn ? "উপজেলা সীমানা" : "Upazila boundaries"}</LayerToggle>
            <LayerToggle active={activeLayers.weatherForecast} onClick={() => toggleLayer("weatherForecast")} icon={Thermometer} tone="blue">{isBn ? "আবহাওয়ার পূর্বাভাস" : "Weather forecast"}</LayerToggle>
            <LayerToggle active={activeLayers.gpm} onClick={() => toggleLayer("gpm")} icon={CloudRain} tone="blue">{isBn ? "রেকর্ডে থাকা বৃষ্টি · GPM" : "Recorded rainfall · GPM"}</LayerToggle>
            <LayerToggle active={activeLayers.climate} onClick={() => toggleLayer("climate")} icon={Thermometer} tone="orange">{isBn ? "আগের তাপমাত্রা · POWER" : "Historical temperature · POWER"}</LayerToggle>
            <LayerToggle active={activeLayers.smap} onClick={() => toggleLayer("smap")} icon={Waves} tone="teal">{isBn ? "মাটির আর্দ্রতা · SMAP" : "Soil moisture · SMAP"}</LayerToggle>
            <LayerToggle active={activeLayers.modis} onClick={() => toggleLayer("modis")} icon={Leaf} tone="green">{isBn ? "গাছপালার সবুজভাব · NDVI" : "Vegetation greenness · NDVI"}</LayerToggle>
            <LayerToggle active={activeLayers.footprints} onClick={() => toggleLayer("footprints")} icon={Compass} tone="violet">{isBn ? "উপগ্রহ এলাকার পরিসর" : "Satellite coverage footprints"}</LayerToggle>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100"><Info size={14} className="mr-1 inline" />{isBn ? "নির্ভরযোগ্য বন্যা-মানচিত্র স্তর এই পেজে বর্তমানে যুক্ত নেই; তাই বন্যার ঝুঁকি দেখানো হচ্ছে না।" : "A reliable flood-monitoring map layer is not currently connected, so no flood-risk overlay is shown."}</div>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-ink">{isBn ? "নির্বাচিত স্থানের তথ্য" : "Selected location"}</h2><p className="mt-1 text-xs text-ink-muted">{selectedLocation?.representative ? (isBn ? "এটি এলাকার প্রতিনিধি স্থান" : "Representative point for this area") : (isBn ? "মানচিত্রে নির্বাচিত স্থানাঙ্ক" : "Point selected on the map")}</p></div><MapPin size={17} className="mt-0.5 shrink-0 text-emerald" /></div>
          {forecastError && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{forecastError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {activeLayers.weatherForecast && <ReadingCard icon={Thermometer} title={isBn ? "তাপমাত্রা · পূর্বাভাস" : "Temperature · forecast"} value={current ? `${display(current.temperatureMinC)}–${display(current.temperatureMaxC)}°C` : (forecastLoading ? "" : (isBn ? "উপাত্ত নেই" : "No data"))} meta={current?.date ? display(current.date) : "Open-Meteo"} note={isBn ? "এটি পূর্বাভাস, পর্যবেক্ষণ নয়।" : "Forecast data, not an observation."} tone="blue" loading={forecastLoading} />}
            {activeLayers.weatherForecast && <ReadingCard icon={CloudRain} title={isBn ? "সম্ভাব্য বৃষ্টি · পূর্বাভাস" : "Expected rain · forecast"} value={today?.precipitationSumMm != null ? `${display(today.precipitationSumMm)} mm` : (forecastLoading ? "" : (isBn ? "উপাত্ত নেই" : "No data"))} meta={today?.precipitationProbabilityMax != null ? `${display(today.precipitationProbabilityMax)}% ${isBn ? "সম্ভাবনা" : "chance"}` : "Open-Meteo"} note={isBn ? "আজকের মডেলভিত্তিক দৈনিক পূর্বাভাস।" : "Model-based daily forecast for the selected point."} tone="blue" loading={forecastLoading} />}
            {activeLayers.gpm && <ReadingCard icon={CloudRain} title={isBn ? "রেকর্ডে থাকা বৃষ্টি · GPM" : "Recorded rainfall · GPM"} value={rainfall?.completeness === "complete" ? `${display(rainfall.totalPrecipitationMm)} mm` : (isBn ? "যাচাইযোগ্য পূর্ণ দিনের তথ্য নেই" : "No complete verified day")} meta={rainfall?.dateLabel ? `${isBn ? "পর্যবেক্ষণ" : "Observed"}: ${display(rainfall.dateLabel)}` : (isBn ? "পর্যবেক্ষণ নেই" : "No observation available")} note={isBn ? "জেলা-প্রতিনিধি স্যাটেলাইট গ্রিড; জমির বৃষ্টিমাপক নয়।" : "District reference satellite grid; not a farm rain gauge."} tone="blue" />}
            {activeLayers.climate && <ReadingCard icon={Thermometer} title={isBn ? "গড় তাপমাত্রা · POWER" : "Mean temperature · POWER"} value={climate.T2M?.value != null ? `${display(climate.T2M.value)}°C` : (isBn ? "উপাত্ত নেই" : "No data")} meta={climate.T2M?.observationDate ? `${isBn ? "রেকর্ড" : "Recorded"}: ${display(climate.T2M.observationDate)}` : "NASA POWER · historical"} note={isBn ? "বৃহৎ এলাকার ঐতিহাসিক গ্রিড তথ্য; বর্তমান আবহাওয়া নয়।" : "Historical gridded context; not current weather."} tone="orange" />}
            {activeLayers.smap && <ReadingCard icon={Waves} title={isBn ? "মাটির আর্দ্রতা · SMAP" : "Soil moisture · SMAP"} value={soil?.isRecommendedQuality && soil?.soilMoisture != null ? `${display(soil.soilMoisture)} m³/m³` : (isBn ? "যাচাইকৃত উপাত্ত নেই" : "No quality-approved data")} meta={soil?.dateLabel ? `${isBn ? "পর্যবেক্ষণ" : "Observed"}: ${display(soil.dateLabel)}` : "NASA SMAP"} note={isBn ? "আঞ্চলিক উপগ্রহ গ্রিডের উপরিভাগের আর্দ্রতা; আপনার জমির পরীক্ষা নয়।" : "Regional surface-moisture grid; not a field soil test."} tone="teal" />}
            {activeLayers.modis && <ReadingCard icon={Leaf} title={isBn ? "গাছপালার সবুজভাব · NDVI" : "Vegetation greenness · NDVI"} value={vegetation?.isReliableQuality && vegetation?.ndvi != null ? display(vegetation.ndvi) : (isBn ? "যাচাইকৃত উপাত্ত নেই" : "No quality-approved data")} meta={vegetation?.dateLabel ? `${isBn ? "পর্যবেক্ষণ" : "Observed"}: ${display(vegetation.dateLabel)}` : "NASA MODIS"} note={isBn ? "এলাকার গাছপালার সবুজভাব; ফসলের রোগ বা ফলনের মাপ নয়।" : "Regional vegetation greenness; not crop disease or yield."} tone="lime" />}
          </div>
          {forecast && activeLayers.weatherForecast && <div className="mt-3 border-t border-line pt-3 text-[11px] leading-5 text-ink-muted">{isBn ? "পূর্বাভাসের উৎস" : "Forecast source"}: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="font-semibold text-emerald underline-offset-2 hover:underline">Open-Meteo</a> · {isBn ? "সর্বশেষ হালনাগাদ" : "Updated"}: {timestamp}{forecast.meta?.isStale ? ` · ${isBn ? "সংরক্ষিত পুরোনো পূর্বাভাস" : "Cached earlier forecast"}` : ""}</div>}
          {selectedLocation && <p className="mt-2 text-[11px] text-ink-muted">{isBn ? "স্থানাঙ্ক" : "Coordinates"}: {display(Number(selectedLocation.latitude).toFixed(4))}, {display(Number(selectedLocation.longitude).toFixed(4))}</p>}
        </section>
      </aside>
    </section>

    <p className="flex gap-2 rounded-2xl border border-line bg-surface/70 p-3 text-xs leading-5 text-ink-muted"><Info size={15} className="mt-0.5 shrink-0 text-emerald" />{isBn ? "এই মানচিত্রে আবহাওয়ার পূর্বাভাস Open‑Meteo থেকে, আর উপগ্রহ পর্যবেক্ষণ NASA GPM, SMAP ও MODIS থেকে আসে। সব উপাত্ত আঞ্চলিক বা মডেলভিত্তিক; এগুলো আপনার জমির সরাসরি পরিমাপ নয়।" : "Weather forecasts come from Open‑Meteo; satellite observations come from NASA GPM, SMAP, and MODIS. These are regional or model-based readings, not direct measurements from your field."}</p>
  </div>;
}

export default function ProtectedMapPage() {
  return <PrivateAccess><MapPage /></PrivateAccess>;
}
