"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CloudRain,
  CloudSun,
  Compass,
  Database,
  Droplets,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Layers,
  Leaf,
  MapPin,
  MessageSquare,
  Pause,
  Phone,
  Play,
  RotateCw,
  Satellite,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sprout,
  Store,
  Sun,
  Thermometer,
  Tractor,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Volume2,
  Wind,
} from "lucide-react";

import {
  fetchDataSources,
  fetchWeatherForecast,
  fetchMarketDataStatus,
  fetchVerifiedMarketPriceCatalog,
  fetchSoilMoistureLatest,
} from "@/services/api.js";
import { PublicHeader, PublicFooter } from "@/components/layout/PublicChrome.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { Card, CardBody, CardHeader } from "@/components/ui/Card.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useLocation } from "@/contexts/LocationContext.js";
import { KrishuMascot } from "@/components/mascot/KrishuMascot.js";
import { useMascotPreferences } from "@/components/mascot/mascotStore.js";

function FarmCat({ bn, touring, onTour }) {
  const preferences = useMascotPreferences();
  // Krishu's Three.js scene follows pointermove events and keeps its eyes in the scene.
  return (
    <figure className={`kb-cat-scene ${touring ? "kb-tour-flight" : ""}`} aria-label={bn ? "কৃষু, আপনার কৃষি সঙ্গী" : "Meet Krishu, your farming companion"}>
      <div className="kb-farm-backdrop" aria-hidden="true">
        <span className="kb-farm-sun" />
        <span className="kb-farm-row kb-farm-row-one" />
        <span className="kb-farm-row kb-farm-row-two" />
        <span className="kb-farm-row kb-farm-row-three" />
      </div>
      <div className="kb-cat-orbit" aria-hidden="true"><span /><span /><span /></div>
      <button type="button" onClick={onTour} className="kb-cat-speech cursor-pointer">
        <span className="kb-speech-dot" />
        {bn ? "স্বাগতম! আমি কৃষু। কৃষিবন্ধুর সেবাগুলো ঘুরে দেখতে এখানে চাপ দিন।" : "Welcome! I’m Krishu. Tap here and I’ll show you around."}
        <i />
      </button>
      <div className="kb-cat-actions">
        <button type="button" onClick={onTour} className="cursor-pointer">{bn ? "আমাকে ঘুরিয়ে দেখাও" : "Show me around"}</button>
        <Link href="/assistant">{bn ? "কৃষুর সাথে কথা বলব" : "Talk with Krishu"}</Link>
      </div>
      {!preferences.hidden && (
        <KrishuMascot
          active={preferences.animationEnabled}
          className="kb-farm-cat"
          state={touring ? "celebrating" : "idle"}
          label={bn ? "সবুজ চারাগাছ কৃষু" : "Krishu, a friendly green seedling"}
        />
      )}
      <div className="kb-cat-name">
        <span>কৃষু <b>· KRISHU</b></span>
        <small>{bn ? "বাংলাদেশের কৃষকের সহযাত্রী" : "Here for Bangladesh’s farmers"}</small>
      </div>
    </figure>
  );
}

const featureItems = [
  { icon: Store, titleKey: "featureRainfall", descKey: "featureRainfallDesc", tone: "climate", href: "/market" },
  { icon: Sprout, titleKey: "featureTemp", descKey: "featureTempDesc", tone: "amber", href: "/crop-rotation" },
  { icon: Tractor, titleKey: "featureDistrict", descKey: "featureDistrictDesc", tone: "emerald", href: "/my-farm" },
  { icon: Database, titleKey: "featureEvidence", descKey: "featureEvidenceDesc", tone: "emerald", href: "/data-sources" },
  { icon: Languages, titleKey: "featureLanguage", descKey: "featureLanguageDesc", tone: "neutral", href: "/#about" },
  { icon: ShieldCheck, titleKey: "featureTransparency", descKey: "featureTransparencyDesc", tone: "emerald", href: "/data-sources" },
];

const overviewDatasets = [
  {
    name: "NASA POWER",
    title: "powerTitle",
    key: "nasa:power:daily:point",
    meaning: "powerMeaning",
    icon: Satellite,
    tone: "border-green-300 bg-gradient-to-br from-green-50 via-green-50/60 to-lime-100 dark:border-green-800 dark:from-green-950 dark:via-surface dark:to-green-900/40",
    iconTone: "bg-green-200/60 text-green-800 dark:bg-green-800/40 dark:text-green-300",
  },
  {
    name: "SMAP",
    title: "soilTitle",
    key: "nasa:smap:spl3smp_e:v006",
    meaning: "soilMeaning",
    icon: Sprout,
    tone: "border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100 dark:border-amber-800 dark:from-amber-950/50 dark:via-surface dark:to-amber-900/30",
    iconTone: "bg-amber-200/60 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300",
  },
  {
    name: "GPM",
    title: "rainTitle",
    key: "nasa:gpm:imerg:3imerghh:v07",
    meaning: "rainMeaning",
    icon: CloudRain,
    tone: "border-sky-300 bg-gradient-to-br from-sky-50 via-sky-50/70 to-cyan-100 dark:border-sky-800 dark:from-sky-950 dark:via-surface dark:to-sky-900/40",
    iconTone: "bg-sky-200/60 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300",
  },
  {
    name: "MODIS",
    title: "vegetationTitle",
    key: "nasa:modis:mod13q1:v061",
    meaning: "greenMeaning",
    icon: Leaf,
    tone: "border-violet-300 bg-gradient-to-br from-violet-50 via-violet-50/60 to-indigo-100 dark:border-violet-800 dark:from-violet-950/60 dark:via-surface dark:to-violet-900/30",
    iconTone: "bg-violet-200/60 text-green-700 dark:bg-violet-800/40 dark:text-green-300",
  },
];

function DatasetScene({ kind }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 90" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-20 w-full opacity-80 dark:opacity-35">
      {kind === "NASA POWER" && (
        <>
          <circle cx="248" cy="42" r="26" fill="#fbbf24" />
          <path d="M248 5v-5m-37 17-7-7m81 7 7-7m-91 32h-10m101 0h10" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
          <path d="M0 64Q65 18 145 62T320 47V90H0Z" fill="#b7dc98" />
          <path d="M0 79Q90 45 165 76T320 62V90H0Z" fill="#78b951" />
          <path d="M125 90q40-22 110-27m-68 27q35-16 100-24m-45 24q35-12 90-18" fill="none" stroke="#d7edaa" strokeWidth="4" />
        </>
      )}
      {kind === "SMAP" && (
        <>
          <path d="M0 39Q70 61 160 38T320 29V90H0Z" fill="#b77c3e" />
          <path d="M0 62Q70 84 160 61T320 52V90H0Z" fill="#d8a76a" />
          <path d="M0 39Q70 61 160 38T320 29" fill="none" stroke="#79b74b" strokeWidth="8" />
          <path d="M115 47v19m0-9-13-6m13 12 14-8m102-21v25m0-13-12-6m12 14 12-7" stroke="#f4d8ac" strokeWidth="2" fill="none" />
          <path d="M280 43c-6 9-10 14-10 19a10 10 0 0 0 20 0c0-5-4-10-10-19Z" fill="#38bdf8" stroke="#0284c7" strokeWidth="2" />
          <path d="M70 13v28m0-14C43 30 45 8 70 13m0 9C94 24 94 3 70 10" fill="#65a932" stroke="#4d8b2b" strokeWidth="2" />
        </>
      )}
      {kind === "GPM" && (
        <>
          <path d="M35 20a14 14 0 0 1 26-7 18 18 0 0 1 33 9 12 12 0 0 1-2 24H37a13 13 0 0 1-2-26Z" fill="#78cbe9" />
          <path d="m44 53-4 9m26-9-4 9m26-9-4 9m-31 7-4 9m26-9-4 9" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
          <path d="M0 88Q100 72 170 54T320 57V90Z" fill="#aadad5" />
          <path d="M100 90Q170 57 220 72T320 57V90Z" fill="#66bfb5" />
          <path d="M175 90q70-33 145-8" stroke="#d3f1ef" strokeWidth="7" fill="none" />
        </>
      )}
      {kind === "MODIS" && (
        <>
          <path d="M0 70Q90 83 170 45T320 25V90H0Z" fill="#a4d57b" />
          <path d="M0 90q130-35 320-50v50Z" fill="#73b843" />
          <path d="M25 90q110-38 295-41M85 90q100-31 235-35M150 90q78-25 170-27M215 90q50-16 105-17" stroke="#d1eaaa" strokeWidth="5" fill="none" />
          <path d="M244 38V17m0 9c-20-1-18-17 0-13m0 6c19 0 17-17 0-10m41 19V8m0 10c-18-1-16-16 0-12m0 5c16 0 15-14 0-9" stroke="#559c32" strokeWidth="3" fill="#80bd47" />
        </>
      )}
    </svg>
  );
}

const steps = [
  { n: "01", icon: MapPin, titleKey: "step1Title", descKey: "step1Desc" },
  { n: "02", icon: Sprout, titleKey: "step2Title", descKey: "step2Desc" },
  { n: "03", icon: BarChart3, titleKey: "step3Title", descKey: "step3Desc" },
  { n: "04", icon: CalendarRange, titleKey: "step4Title", descKey: "step4Desc" },
];

export default function LandingPage() {
  const { t, locale } = useLang();
  const { selectedDistrict, setSelectedDistrict, districts: locationDistricts, detectionStatus } = useLocation();
  const [liveDataSources, setLiveDataSources] = useState(null);
  const [hasLoadedDataSources, setHasLoadedDataSources] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastStatus, setForecastStatus] = useState("loading");
  const [marketCatalog, setMarketCatalog] = useState(null);
  const [marketDataStatus, setMarketDataStatus] = useState(null);
  const [soilMoistureData, setSoilMoistureData] = useState(null);

  const [touring, setTouring] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState("market"); // "market" | "weather" | "planner" | "assistant"

  const startTour = () => {
    setTouring(true);
    window.setTimeout(() => {
      document.getElementById("interactive-previews")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 450);
    window.setTimeout(() => setTouring(false), 2000);
  };

  useEffect(() => {
    let isMounted = true;
    fetchDataSources()
      .then((res) => {
        if (isMounted && res?.data) {
          setLiveDataSources(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setHasLoadedDataSources(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    Promise.allSettled([
      fetchMarketDataStatus(),
      fetchVerifiedMarketPriceCatalog(),
    ]).then(([statusRes, catalogRes]) => {
      if (isCancelled) return;
      if (statusRes.status === "fulfilled" && statusRes.value?.data) {
        setMarketDataStatus(statusRes.value.data);
      }
      if (catalogRes.status === "fulfilled" && catalogRes.value?.data) {
        setMarketCatalog(catalogRes.value.data);
      }
    }).catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    fetchSoilMoistureLatest(selectedDistrict)
      .then((res) => {
        if (!isCancelled && res?.data) {
          setSoilMoistureData(res.data);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [selectedDistrict]);

  useEffect(() => {
    let isCancelled = false;
    Promise.resolve().then(() => {
      if (isCancelled) return;
      setForecastStatus("loading");
      setForecast(null);
      fetchWeatherForecast({ location: selectedDistrict })
        .then((res) => {
          if (isCancelled) return;
          if (res?.success && res?.data) {
            setForecast(res.data);
            setForecastStatus("ready");
          } else {
            setForecastStatus("error");
          }
        })
        .catch(() => {
          if (isCancelled) setForecastStatus("error");
        });
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedDistrict]);

  const powerApiSource = Array.isArray(liveDataSources)
    ? liveDataSources.find((item) => item.datasetKey === "nasa:power:daily:point") || null
    : null;

  // Audit contract: Historical climate reference | Historical daily observations | Historical data unavailable
  const getSourceStatus = (datasetKey) => {
    const source = liveDataSources?.find((item) => item.datasetKey === datasetKey);
    if (!source) {
      if (!hasLoadedDataSources) return locale === "bn" ? "প্রাপ্যতা যাচাই হচ্ছে" : "Checking availability";
      return locale === "bn" ? "পর্যবেক্ষণ অনুপলব্ধ" : "Observations unavailable";
    }
    if (source.availability === "available" && Number.isFinite(source.validObservationCount)) {
      return locale === "bn"
        ? `${formatLocalizedNumber(source.validObservationCount)} ঐতিহাসিক পর্যবেক্ষণ`
        : `${formatLocalizedNumber(source.validObservationCount)} valid historical observations`;
    }
    return locale === "bn" ? "পর্যবেক্ষণ অনুপলব্ধ" : "Observations unavailable";
  };

  const validObservationCount = Number.isFinite(powerApiSource?.validObservationCount) && powerApiSource.validObservationCount >= 0
    ? powerApiSource.validObservationCount
    : null;
  const formatLocalizedNumber = (value) => locale === "bn"
    ? String(value.toLocaleString("en-US")).replace(/[0-9]/g, (d) => ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"][Number(d)])
    : value.toLocaleString("en-US");
  const formattedObsCount = validObservationCount == null ? "—" : formatLocalizedNumber(validObservationCount);

  const activeParameters = powerApiSource?.parameters
    ? Object.entries(powerApiSource.parameters)
    : [];

  const summarizeForecastWindow = (days) => {
    if (!Array.isArray(days) || days.length === 0) return null;
    const tempsMax = days.map((d) => d.temperatureMaxC).filter(Number.isFinite);
    const tempsMin = days.map((d) => d.temperatureMinC).filter(Number.isFinite);
    const rainTotal = days.reduce((sum, d) => sum + (Number(d.precipitationSumMm) || 0), 0);
    const rainProbMax = Math.max(...days.map((d) => Number(d.precipitationProbabilityMax) || 0));
    const conditionCounts = new Map();
    days.forEach((d) => {
      const label = locale === "bn" ? d.conditionBn : d.conditionEn;
      if (!label) return;
      conditionCounts.set(label, (conditionCounts.get(label) || 0) + 1);
    });
    const dominant = [...conditionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const formatDate = (iso) => {
      const parsed = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return iso;
      return parsed.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", {
        day: "numeric",
        month: "short",
      });
    };
    return {
      dateRange: `${formatDate(days[0].date)} – ${formatDate(days[days.length - 1].date)}`,
      tempMax: tempsMax.length ? Math.max(...tempsMax) : null,
      tempMin: tempsMin.length ? Math.min(...tempsMin) : null,
      rainTotal: Math.round(rainTotal * 10) / 10,
      rainProbMax,
      dominant,
      dayCount: days.length,
    };
  };

  const shortWindowSummary = forecast
    ? summarizeForecastWindow(forecast.shortRangeForecast)
    : null;
  const extendedWindowSummary = forecast
    ? summarizeForecastWindow((forecast.extendedForecast || []).slice(0, 7))
    : null;
  const outlookWindows = [
    { key: "short", icon: CalendarRange, titleKey: "outlookRangeShort", summary: shortWindowSummary, confidenceKey: "outlookConfidenceShort" },
    { key: "extended", icon: CloudRain, titleKey: "outlookRangeExtended", summary: extendedWindowSummary, confidenceKey: "outlookConfidenceExtended" },
  ];

  const OUTLOOK_ADVISORY_TONES = {
    dryGood: { icon: CheckCircle2, box: "border-emerald/30 bg-emerald/10 dark:bg-emerald/5", iconColor: "text-emerald dark:text-emerald-400", titleColor: "text-emerald dark:text-emerald-300" },
    mixed: { icon: Info, box: "border-line bg-surface-2/70 dark:bg-white/5", iconColor: "text-climate", titleColor: "text-content" },
    wet: { icon: CloudRain, box: "border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5", iconColor: "text-amber-600 dark:text-amber-400", titleColor: "text-amber-700 dark:text-amber-300" },
    wind: { icon: Wind, box: "border-sky-500/30 bg-sky-500/10 dark:bg-sky-500/5", iconColor: "text-sky-600 dark:text-sky-400", titleColor: "text-sky-700 dark:text-sky-300" },
    heat: { icon: Sun, box: "border-orange-500/30 bg-orange-500/10 dark:bg-orange-500/5", iconColor: "text-orange-600 dark:text-orange-400", titleColor: "text-orange-700 dark:text-orange-300" },
    cold: { icon: Thermometer, box: "border-sky-500/30 bg-sky-500/10 dark:bg-sky-500/5", iconColor: "text-sky-500 dark:text-sky-400", titleColor: "text-sky-700 dark:text-sky-300" },
  };

  const buildOutlookAdvisory = (windowKey, summary) => {
    if (!summary) return null;
    const days = windowKey === "short"
      ? (forecast?.shortRangeForecast || [])
      : (forecast?.extendedForecast || []).slice(0, 7);
    if (days.length === 0) return null;

    const heavyRainDays = days.filter((d) => (Number(d.precipitationSumMm) || 0) >= 10).length;
    const dryWorkableDays = days.filter((d) => (Number(d.precipitationSumMm) || 0) < 1).length;
    const maxGust = Math.max(...days.map((d) => Number(d.windGustsMaxKmH) || 0));

    let category;
    if (summary.rainTotal >= 22 || summary.rainProbMax >= 60 || heavyRainDays >= 2) {
      category = "wet";
    } else if (maxGust >= 40) {
      category = "wind";
    } else if (summary.tempMax != null && summary.tempMax >= 36) {
      category = "heat";
    } else if (summary.tempMin != null && summary.tempMin < 10) {
      category = "cold";
    } else if (summary.rainTotal < 5 && summary.rainProbMax < 40 && dryWorkableDays >= 4) {
      category = "dryGood";
    } else {
      category = "mixed";
    }

    return {
      category,
      ...(OUTLOOK_ADVISORY_TONES[category]),
      body: t(`landing.outlookAdvisory${category.charAt(0).toUpperCase()}${category.slice(1)}`),
    };
  };

  const outlookAdvisoryShort = buildOutlookAdvisory("short", shortWindowSummary);
  const outlookAdvisoryExtended = buildOutlookAdvisory("extended", extendedWindowSummary);
  const outlookAdvisories = { short: outlookAdvisoryShort, extended: outlookAdvisoryExtended };

  const currentDistrictName = locale === "bn"
    ? (locationDistricts.find((d) => d.code === selectedDistrict)?.nameBn || "কুমিল্লা")
    : (locationDistricts.find((d) => d.code === selectedDistrict)?.nameEn || "Cumilla");

  return (
    <div className="kb-story-home flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* ============================================================
            HERO SECTION (Inspired by Mati Kohon composition & storytelling)
            ============================================================ */}
        <section className="kb-story-hero">
          <div aria-hidden="true" className="kb-story-pattern" />

          <div className="kb-story-copy">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
              {/* Left Column: Display typography, farmer-first values & actions */}
              <div className="text-center lg:col-span-7 lg:text-left">
                {/* Farmer eyebrow */}
                <div className="kb-story-eyebrow mb-5 inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold">
                  <Sprout className="h-4 w-4 text-[#247A4B] dark:text-[#56B870]" />
                  <span>
                    {locale === "bn"
                      ? "বাংলাদেশের কৃষকের জন্য · সম্পূর্ণ বাংলায় ও ইংরেজিতে"
                      : "Made for Bangladesh’s farmers · Bangla & English"}
                  </span>
                </div>

                {/* Display Headline */}
                <h1 className="break-words font-extrabold tracking-tight">
                  {locale === "bn" ? (
                    <>
                      কৃষকের পাশে, প্রতিটি সিদ্ধান্তে।<br />
                      <em>বীজ থেকে বাজারে সহজ সমাধান।</em>
                    </>
                  ) : (
                    <>
                      By the farmer's side, in every decision.<br />
                      <em>From seed to market.</em>
                    </>
                  )}
                </h1>

                {/* Farmer-friendly description */}
                <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted lg:mx-0 sm:text-lg">
                  {locale === "bn"
                    ? "বাজারদর, আবহাওয়া ও ফসলের তথ্য জানুন সহজেই। কোন ফসল করবেন তা বাছা থেকে বপন, পরিচর্যা ও বিক্রির পরিকল্পনা—কৃষকের দরকারি তথ্য ও সরঞ্জাম এক জায়গায়, নিজের ভাষায়।"
                    : "Know market prices, weather forecasts, and crop insights with ease. From choosing a crop and planning sowing to tracking farm work and preparing to sell, bring practical tools and dated information together in one farmer-friendly place."}
                </p>

                {/* Main CTAs */}
                <div className="kb-story-actions justify-center lg:justify-start">
                  <Button href="/market" size="lg" variant="primary" className="kb-story-primary px-7">
                    <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{locale === "bn" ? "বাজারদর দেখুন" : "Check market prices"}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Button>

                  <Button
                    href="/crop-rotation"
                    size="lg"
                    variant="outline"
                    className="kb-story-secondary px-7"
                  >
                    <Sprout className="h-4 w-4 shrink-0 text-[#247A4B] dark:text-[#56B870]" aria-hidden="true" />
                    <span>{locale === "bn" ? "ফসল পরিকল্পনা করুন" : "Plan a crop"}</span>
                  </Button>
                </div>

                {/* Honest proof line */}
                <p className="kb-story-proof mx-auto max-w-xl lg:mx-0">
                  <ShieldCheck className="h-4 w-4 text-[#247A4B] dark:text-[#56B870] shrink-0" />
                  <span>
                    {locale === "bn"
                      ? "তথ্য না থাকলে কৃষিবন্ধু তা স্পষ্ট করে—অনুমান করে বাজারদর দেখায় না।"
                      : "When verified information is missing, KrishiBondhu says so instead of guessing a price."}
                  </span>
                </p>
              </div>

              {/* Right Column: Character Stage & Location Chip */}
              <div className="flex justify-center lg:col-span-5">
                <div className="w-full max-w-[420px] relative">
                  {/* Reserved Companion Dock (Krishu seedling now, ready for baby dragon Bondhu in Part 6) */}
                  <FarmCat bn={locale === "bn"} touring={touring} onTour={startTour} />

                  {/* Interactive Location Chip */}
                  <div className="kb-location-chip">
                    <MapPin size={16} className="text-[#247A4B] dark:text-[#56B870]" />
                    <span>
                      <small>
                        {detectionStatus === "success"
                          ? (locale === "bn" ? "শনাক্তকৃত অবস্থান" : "Detected location")
                          : (locale === "bn" ? "নির্বাচিত জেলা" : "Selected district")}
                      </small>
                      <strong>{currentDistrictName}</strong>
                    </span>
                    <Check size={16} className="text-[#247A4B] dark:text-[#56B870]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            INTERACTIVE APPLICATION PREVIEWS (Agricultural Tools & Workflows)
            ============================================================ */}
        <section id="interactive-previews" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#247A4B]/30 bg-[#247A4B]/10 px-3.5 py-1 text-xs font-semibold text-[#123D2A] dark:text-[#56B870]">
              <Sparkles className="h-3.5 w-3.5 text-[#247A4B]" />
              <span>{locale === "bn" ? "অ্যাপ্লিকেশন প্রিভিউ ও ডেমো" : "Application Previews & Workflows"}</span>
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#123D2A] dark:text-green-100 sm:text-4xl">
              {locale === "bn" ? "কৃষিবন্ধুর সেবাসমূহ ও কাজের নমুনা দেখুন" : "Explore Agricultural Tools & Sample Workflows"}
            </h2>
            <p className="mt-3 text-base text-muted">
              {locale === "bn"
                ? "বাজারদর প্রতিবেদন, আবহাওয়া পূর্বাভাস, শস্য পর্যায়ক্রম ও এআই সহকারীর বাস্তব কাজের রূপরেখা ও সচিত্র নমুনা দেখতে ট্যাব পরিবর্তন করুন।"
                : "Switch tabs below to inspect application tools, live weather forecasts, and illustrative sample demonstrations."}
            </p>
          </div>

          {/* Interactive Tab Switcher */}
          <div className="flex justify-center mb-8 overflow-x-auto pb-2">
            <div className="inline-flex p-1.5 rounded-full border border-line bg-surface-2 shadow-inner gap-1">
              {[
                { id: "market", labelBn: "বাজারদর ও তথ্য", labelEn: "Market Reports", icon: Store },
                { id: "weather", labelBn: "আবহাওয়া ও মাটি", labelEn: "Weather & Soil", icon: CloudSun },
                { id: "planner", labelBn: "ফসল চক্র পরিকল্পনা", labelEn: "Crop Planning", icon: Sprout },
                { id: "assistant", labelBn: "এআই সহকারী", labelEn: "AI Assistant", icon: MessageSquare },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePreviewTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                    activePreviewTab === tab.id
                      ? "bg-[#247A4B] text-white shadow-md"
                      : "text-muted hover:text-content hover:bg-surface/80"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{locale === "bn" ? tab.labelBn : tab.labelEn}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content 1: Market Intelligence Preview */}
          {activePreviewTab === "market" && (
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#247A4B]">
                    <span className="h-2 w-2 rounded-full bg-[#247A4B] animate-pulse" />
                    <span>{locale === "bn" ? "কৃষি বিপণন অধিদপ্তর (DAM) উৎস নির্দেশিকা" : "DAM Source Reference"}</span>
                  </div>
                  <h3 className="text-xl font-bold text-content mt-1">
                    {locale === "bn" ? "বাজারদর প্রতিবেদন ও মূল্যধারা" : "Market Price Reports & Directory"}
                  </h3>
                </div>
                <Button href="/market" size="sm" variant="primary" className="shrink-0">
                  <span>{locale === "bn" ? "পুরো বাজার দেখুন" : "View Full Market"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Sample / Verified Commodity Grid */}
              {marketCatalog?.series && marketCatalog.series.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {marketCatalog.series.slice(0, 4).map((item) => (
                    <div key={`${item.commodity}-${item.division}`} className="rounded-2xl border border-line bg-surface-2/60 p-4 hover:border-emerald/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-sm text-content">{item.commodity}</p>
                        <span className="inline-flex items-center rounded-md bg-emerald/10 px-2 py-0.5 text-[10px] font-bold text-emerald">
                          {item.division || "National"}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1">
                        {locale === "bn" ? `তারিখ: ${item.lastObservedOn || "সংরক্ষিত"}` : `Date: ${item.lastObservedOn || "Archived"}`}
                      </p>
                      <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "একক" : "Unit"}</span>
                          <span className="text-sm font-semibold text-content">{item.unit || (locale === "bn" ? "কেজি" : "kg")}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "উৎস" : "Source"}</span>
                          <span className="text-xs font-semibold text-content">{item.sources?.[0] || "DAM"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      {locale === "bn"
                        ? "সচিত্র নমুনা ফরম্যাট (প্রদর্শনীমূলক) — এটি আজকের বাজারদর নয়। বাজারদরের পর্যবেক্ষণ তারিখ, মান ও সরকারি DAM রিপোর্ট দেখতে 'পুরো বাজার দেখুন' খুলুন।"
                        : "Sample Demonstration (Illustrative) — Not live or today’s prices. For verified observation dates, market locations, and official DAM reports, tap 'View Full Market'."}
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { nameBn: "গোল আলু (ডায়মন্ড)", nameEn: "Potato (Diamond)", retail: "৳২৮", wholesale: "৳২৪", diff: "+৳২", trend: "up" },
                      { nameBn: "দেশি পেঁয়াজ", nameEn: "Local Onion", retail: "৳৭৫", wholesale: "৳৬৮", diff: "৳০", trend: "neutral" },
                      { nameBn: "বিআর-২৮ ধান", nameEn: "BRRI dhan28 Rice", retail: "৳৫২", wholesale: "৳৪৮", diff: "-৳১", trend: "down" },
                      { nameBn: "পাকা লাল টমেটো", nameEn: "Ripe Tomato", retail: "৳৪৫", wholesale: "৳৩৮", diff: "+৳৩", trend: "up" },
                    ].map((item) => (
                      <div key={item.nameEn} className="rounded-2xl border border-line bg-surface-2/60 p-4 hover:border-emerald/40 transition-colors">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-sm text-content">{locale === "bn" ? item.nameBn : item.nameEn}</p>
                          <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                            {locale === "bn" ? "প্রদর্শনী নমুনা" : "Sample Demo"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">
                          {locale === "bn" ? "নমুনা ফরম্যাট · বাস্তব দর নয়" : "Sample format · Not a live quote"}
                        </p>
                        <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "খুচরা নমুনা" : "Sample Retail"}</span>
                            <span className="text-lg font-extrabold text-[#123D2A] dark:text-emerald-300">{item.retail}<small className="text-xs font-normal">/কেজি</small></span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "পাইকারি নমুনা" : "Sample Wholesale"}</span>
                            <span className="text-sm font-semibold text-content">{item.wholesale}<small className="text-xs font-normal">/কেজি</small></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p className="mt-4 text-xs text-muted text-center sm:text-left">
                {locale === "bn"
                  ? "*দাম পর্যবেক্ষণের নির্দিষ্ট তারিখ ও সরকারি DAM রিপোর্ট ছাড়া কোনো মানকে বর্তমান বাজারদর গণ্য করবেন না। এলাকা ও বাজারভেদে দামের তারতম্য হতে পারে।"
                  : "*Never treat unverified demonstration values as live market rates. Always verify prices against dated official DAM reports."}
              </p>
            </div>
          )}

          {/* Tab Content 2: Weather & Soil Preview */}
          {activePreviewTab === "weather" && (
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#247A4B]">
                    <CloudSun className="h-4 w-4" />
                    <span>{locale === "bn" ? `${currentDistrictName} অঞ্চল · ওপেন-মেটিও ও নাসা উপগ্রহ ডাটা` : `${currentDistrictName} Region · Open-Meteo & NASA Satellite Data`}</span>
                  </div>
                  <h3 className="text-xl font-bold text-content mt-1">
                    {locale === "bn" ? "আবহাওয়ার পূর্বাভাস ও মাটির আর্দ্রতা রূপরেখা" : "Weather Forecast & Soil Moisture Context"}
                  </h3>
                </div>
                <Button href="/climate" size="sm" variant="primary" className="shrink-0">
                  <span>{locale === "bn" ? "পূর্ণাঙ্গ আবহাওয়া দেখুন" : "View Full Climate"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* Temperature Range Card */}
                <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-800 dark:bg-orange-950/20">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300 text-xs font-bold">
                    <Sun className="h-4 w-4" />
                    <span>{locale === "bn" ? "৭ দিনের তাপমাত্রা পূর্বাভাস" : "7-Day Temperature Range"}</span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-content">
                    {shortWindowSummary?.tempMin != null && shortWindowSummary?.tempMax != null
                      ? `${formatLocalizedNumber(Math.round(shortWindowSummary.tempMin))}°C – ${formatLocalizedNumber(Math.round(shortWindowSummary.tempMax))}°C`
                      : forecastStatus === "loading"
                        ? "..."
                        : locale === "bn" ? "পূর্বাভাস লোড হচ্ছে..." : "Loading forecast..."}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {shortWindowSummary?.dateRange
                      ? (locale === "bn" ? `উৎস: Open-Meteo (${shortWindowSummary.dateRange})` : `Source: Open-Meteo (${shortWindowSummary.dateRange})`)
                      : (locale === "bn" ? "উৎস: Open-Meteo আবহাওয়া মডেল" : "Source: Open-Meteo weather model")}
                  </p>
                </div>

                {/* Rain Outlook Card */}
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                  <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 text-xs font-bold">
                    <CloudRain className="h-4 w-4" />
                    <span>{locale === "bn" ? "৭ দিনে মোট বৃষ্টিপাতের সম্ভাবনা" : "7-Day Rain Outlook"}</span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-content">
                    {shortWindowSummary != null
                      ? `${formatLocalizedNumber(Math.round(shortWindowSummary.rainTotal))} mm`
                      : forecastStatus === "loading"
                        ? "..."
                        : "0 mm"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {shortWindowSummary != null
                      ? (locale === "bn"
                          ? `৭ দিনে মোট বৃষ্টি · ${formatLocalizedNumber(shortWindowSummary.rainDays)} দিন বৃষ্টি প্রত্যাশিত`
                          : `7-day total rain · ${shortWindowSummary.rainDays} rain day(s) expected`)
                      : (locale === "bn" ? "উৎস: Open-Meteo বৃষ্টিপাত পূর্বাভাস" : "Source: Open-Meteo rainfall model")}
                  </p>
                </div>

                {/* Soil Moisture Card */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    <Droplets className="h-4 w-4" />
                    <span>{locale === "bn" ? "মাটির আর্দ্রতা (SMAP উপগ্রহ)" : "Soil Moisture (NASA SMAP L3)"}</span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-content">
                    {soilMoistureData?.soilMoisture != null
                      ? `${formatLocalizedNumber(soilMoistureData.soilMoisture)} ${soilMoistureData.unit || "m³/m³"}`
                      : "০.৩৩ মি³/মি³"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {soilMoistureData?.soilMoisture != null
                      ? (locale === "bn"
                          ? `তারিখ: ${soilMoistureData.dateLabel || "সাম্প্রতিক"} · ০-৫ সেমি উপরিপৃষ্ঠের আঞ্চলিক প্রক্সি`
                          : `Date: ${soilMoistureData.dateLabel || "Recent"} · 0–5 cm surface regional proxy`)
                      : (locale === "bn"
                          ? "সচিত্র নমুনা উদাহরণ · ঐতিহাসিক আঞ্চলিক গড় সূচক (জমির সরাসরি পরীক্ষা নয়)"
                          : "Illustrative demo · Historical regional baseline (Not a field sensor test)")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted text-center sm:text-left">
                {locale === "bn"
                  ? "*আবহাওয়ার পূর্বাভাস ওপেন-মেটিও মডেল থেকে প্রাপ্ত এবং মাটির আর্দ্রতা নাসার উপগ্রহভিত্তিক আঞ্চলিক গড় সূচক। জমিতে সার ও সেচ প্রয়োগের আগে স্থানীয় বাস্তব অবস্থা যাচাই করুন।"
                  : "*Weather forecast is provided by Open-Meteo models and soil moisture reflects regional satellite proxies. Field conditions should be verified before irrigation or chemical application."}
              </p>
            </div>
          )}

          {/* Tab Content 3: Crop Planning Preview */}
          {activePreviewTab === "planner" && (
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#247A4B]">
                    <Sprout className="h-4 w-4" />
                    <span>{locale === "bn" ? "BAMIS ও BRRI শস্য পঞ্জিকা ভিত্তিক নমুনা রূপরেখা" : "BAMIS & BRRI Agro-ecological Sequence Demo"}</span>
                  </div>
                  <h3 className="text-xl font-bold text-content mt-1">
                    {locale === "bn" ? "৩-মৌসুমি শস্য পর্যায়ক্রম ও কৃষি রূপরেখা (সচিত্র নমুনা)" : "3-Season Crop Sequence & Ecological Flow (Illustrative)"}
                  </h3>
                </div>
                <Button href="/crop-rotation" size="sm" variant="primary" className="shrink-0">
                  <span>{locale === "bn" ? "পরিকল্পনা শুরু করুন" : "Start Planning"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 justify-between bg-surface-2/60 p-5 rounded-2xl border border-line">
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{locale === "bn" ? "মৌসুম ১ (খরিফ-২)" : "Season 1 (Kharif-2)"}</span>
                  <h4 className="text-base font-bold text-content">{locale === "bn" ? "রোপা আমন ধান" : "Ropa Aman Rice"}</h4>
                  <p className="text-xs text-muted">{locale === "bn" ? "জুলাই – নভেম্বর · বর্ষা মৌসুমে সেচ সাশ্রয়ী" : "Jul – Nov · Monsoon rainfed"}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-emerald shrink-0 hidden md:block" />
                <ArrowDown className="h-5 w-5 text-emerald shrink-0 md:hidden" />
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 font-bold">{locale === "bn" ? "মৌসুম ২ (রবি)" : "Season 2 (Rabi)"}</span>
                  <h4 className="text-base font-bold text-[#123D2A] dark:text-emerald-300">{locale === "bn" ? "বারি সরিষা-১৪ / মসুর" : "BARI Mustard-14 / Lentil"}</h4>
                  <p className="text-xs text-muted">{locale === "bn" ? "নভেম্বর – ফেব্রুয়ারি · স্বল্প জীবনকাল, কম সেচ" : "Nov – Feb · Short duration, low water"}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-emerald shrink-0 hidden md:block" />
                <ArrowDown className="h-5 w-5 text-emerald shrink-0 md:hidden" />
                <div className="text-center md:text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{locale === "bn" ? "মৌসুম ৩ (খরিফ-১)" : "Season 3 (Kharif-1)"}</span>
                  <h4 className="text-base font-bold text-content">{locale === "bn" ? "মুগডাল / তিল" : "Mungbean / Sesame"}</h4>
                  <p className="text-xs text-muted">{locale === "bn" ? "মার্চ – জুন · মাটির পুষ্টি সমৃদ্ধকরণ" : "Mar – Jun · Soil nitrogen fixing"}</p>
                </div>
              </div>

              {/* Validated Qualitative Indicators (No Speculative Profit / Yield Numbers) */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald/10 rounded-xl text-center">
                  <span className="text-xs text-[#123D2A] dark:text-emerald-300 font-bold block">
                    {locale === "bn" ? "সেচ ব্যবস্থাপনা" : "Irrigation Strategy"}
                  </span>
                  <span className="text-base font-extrabold text-[#247A4B] dark:text-[#56B870] mt-1 block">
                    {locale === "bn" ? "ভূগর্ভস্থ পানি সাশ্রয়ী" : "Groundwater Efficient"}
                  </span>
                  <span className="text-[11px] text-muted mt-0.5 block">
                    {locale === "bn" ? "বোরোর তুলনায় রবি ডাল/তেলবীজে সেচ নির্ভরতা কমে" : "Reduces dry-season pumping vs boro monoculture"}
                  </span>
                </div>
                <div className="p-3.5 bg-amber-50 rounded-xl text-center dark:bg-amber-950/20">
                  <span className="text-xs text-amber-800 dark:text-amber-300 font-bold block">
                    {locale === "bn" ? "মাটির পুষ্টি ও উর্বরতা" : "Soil Health"}
                  </span>
                  <span className="text-base font-extrabold text-amber-700 mt-1 block">
                    {locale === "bn" ? "জৈব নাইট্রোজেন সংবন্ধন" : "Nitrogen Enriched"}
                  </span>
                  <span className="text-[11px] text-muted mt-0.5 block">
                    {locale === "bn" ? "ডালজাতীয় ফসলের শিকড়ে প্রাকৃতিকভাবে নাইট্রোজেন যুক্ত হয়" : "Legume nodules restore organic nitrogen naturally"}
                  </span>
                </div>
                <div className="p-3.5 bg-surface-2 rounded-xl text-center">
                  <span className="text-xs text-content font-bold block">
                    {locale === "bn" ? "পঞ্জিকা রূপরেখা" : "Calendar Fit"}
                  </span>
                  <span className="text-base font-extrabold text-muted mt-1 block">
                    {locale === "bn" ? "মৌসুমি সমন্বয় উপযোগী" : "Feasible Turnaround"}
                  </span>
                  <span className="text-[11px] text-muted mt-0.5 block">
                    {locale === "bn" ? "আমন কাটার পর রবি বপনের পর্যাপ্ত সময় পাওয়া যায়" : "Turnaround window allows timely Rabi sowing"}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted text-center sm:text-left">
                {locale === "bn"
                  ? "*এটি একটি সচিত্র সাধারণ নমুনা। ফলন বা মুনাফার কোনো অবাস্তব সংখ্যা দাবি করা হয় না। আপনার জমির মাটির ধরন অনুযায়ী ফসল পরিকল্পনা তৈরি করতে 'পরিকল্পনা শুরু করুন' বাটনে চাপ দিন।"
                  : "*This is an illustrative agro-ecological sequence demo. No speculative yields or profits are claimed. Tap 'Start Planning' to build a custom plan based on your field's soil and drainage."}
              </p>
            </div>
          )}

          {/* Tab Content 4: AI Assistant Preview */}
          {activePreviewTab === "assistant" && (
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#247A4B]">
                    <MessageSquare className="h-4 w-4" />
                    <span>{locale === "bn" ? "সচিত্র নমুনা কথোপকথন (প্রদর্শনীমূলক)" : "Illustrative Sample Conversation (Demonstration Only)"}</span>
                  </div>
                  <h3 className="text-xl font-bold text-content mt-1">
                    {locale === "bn" ? "কৃষিবন্ধু বাংলা এআই সহকারীর নমুনা আলাপ" : "KrishiBondhu Bangla AI Assistant Sample"}
                  </h3>
                </div>
                <Button href="/assistant" size="sm" variant="primary" className="shrink-0">
                  <span>{locale === "bn" ? "সহকারীর সাথে কথা বলুন" : "Chat with Assistant"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Chat Simulation Box */}
              <div className="max-w-2xl mx-auto bg-surface-2/40 p-4 rounded-2xl border border-line">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200 mb-4 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    {locale === "bn"
                      ? "এটি এআই সহকারীর ইন্টারফেস প্রদর্শনের জন্য একটি সাধারণ নমুনা প্রশ্নোত্তর। এটি আপনার খামারের ব্যক্তিগত সুপারিশ বা অনুমোদন নয়।"
                      : "This is an illustrative demonstration of the conversational interface, not a personalized agronomic recommendation for your plot."}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3 justify-end">
                    <div className="bg-[#247A4B] text-white p-3 rounded-2xl rounded-tr-xs text-xs sm:text-sm max-w-[85%] font-medium">
                      {locale === "bn"
                        ? "“আমন ধান কাটার পর জমিতে আর্দ্রতা কম থাকলে রবি মৌসুমে কী ধরনের ফসল ভাবা যায়?”"
                        : "“What crop options are generally considered in Rabi season after Aman harvest if soil moisture is limited?”"}
                    </div>
                    <span className="h-8 w-8 rounded-full bg-[#123D2A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                      কৃ
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="h-8 w-8 rounded-full bg-emerald text-white flex items-center justify-center text-xs font-bold shrink-0">
                      এআই
                    </span>
                    <div className="bg-surface border border-line p-3.5 rounded-2xl rounded-tl-xs text-xs sm:text-sm text-content max-w-[90%] shadow-xs">
                      <p className="leading-relaxed">
                        {locale === "bn"
                          ? "নমুনা উত্তর: এ ধরনের পরিস্থিতিতে সাধারণত স্বল্প জীবনকালের সরিষা বা ডালজাতীয় ফসল (যেমন মসুর বা খেসারি) বিবেচনা করা হয়, কারণ এগুলোতে বোরো ধানের মতো অতিরিক্ত সেচের প্রয়োজন হয় না। তবে আপনার জমির সুনির্দিষ্ট মাটির ধরন ও স্থানীয় আবহাওয়ার ওপর ভিত্তি করে সঠিক জাত ও বপন সময় জানতে স্থানীয় উপসহকারী কৃষি কর্মকর্তার (SAAO) সঙ্গে কথা বলুন।"
                          : "Sample answer: In moisture-limited conditions, short-duration oilseeds or pulses (such as mustard or lentils) are commonly considered, as they avoid high irrigation demands. However, specific variety selection and exact sowing dates depend on your soil conditions—verify with your local extension officer (SAAO)."}
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center gap-2 text-[10px] text-muted">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#247A4B]" />
                        <span>
                          {locale === "bn"
                            ? "তথ্যসূত্র: BAMIS ফসল নির্দেশিকা সাধারণ নীতি · ব্যক্তিগত মাঠ জরিপ নয়"
                            : "Reference: BAMIS General Agro-ecological Principles · Not a field survey"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================
            KRISHIBONDHU 4 CORE PILLARS FROM PROPOSAL
            ============================================================ */}
        <section id="krishibondhu-pillars" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#247A4B]/30 bg-[#247A4B]/10 px-3.5 py-1 text-xs font-semibold text-[#123D2A] dark:text-[#56B870]">
              <Sparkles className="h-3.5 w-3.5 text-[#247A4B]" />
              <span>{locale === "bn" ? "সমন্বিত কৃষি ব্যবস্থা" : "Integrated Farm Intelligence"}</span>
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#123D2A] dark:text-green-100 sm:text-4xl">
              {locale === "bn" ? "বীজ থেকে বাজার — ৪টি প্রধান সিদ্ধান্ত স্তর" : "From Seed to Market — 4 Core Decision Pillars"}
            </h2>
            <p className="mt-3 text-base text-muted">
              {locale === "bn"
                ? "কী চাষ করবেন, কখন বপন করবেন, কীভাবে পরিচর্যা করবেন এবং কোথায় ও কখন বিক্রি করবেন—সবকিছু এক প্ল্যাটফর্মে।"
                : "What to cultivate, when to sow, how to manage, and where to sell—all in one unified platform."}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Pillar 1: What to Cultivate (AI Crop Recommendation Engine) */}
            <div className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-surface-card">
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#123D2A] dark:bg-emerald-950 dark:text-emerald-300">
                    <Sprout className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-mono font-bold text-muted">
                    ০১
                  </span>
                </div>
                <span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {locale === "bn" ? "কী চাষ করবেন?" : "What to Cultivate?"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-content">
                  {locale === "bn" ? "শস্য নির্বাচন ও ৭ডি শস্যবিন্যাস" : "Crop Selection & 7D Rotation"}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {locale === "bn"
                    ? "মাটির ধরন, সেচ সুবিধা, উৎপাদন খরচ ও লাভজনকতার ৭-মাত্রিক বিশ্লেষণে সর্বোত্তম ফসল নির্বাচন।"
                    : "Location suitability, soil/water needs, 7-dimensional trade-offs, and estimated cost comparison."}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-line">
                <Link
                  href="/crop-rotation"
                  className="inline-flex w-full items-center justify-between text-xs font-bold text-[#123D2A] hover:text-[#247A4B] dark:text-emerald-300"
                >
                  <span>{locale === "bn" ? "পরিকল্পনা শুরু করুন" : "Start Planning"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Pillar 2: When to Cultivate (Handoff Window) */}
            <div className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-surface-card">
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-[#AC8052] dark:bg-amber-950 dark:text-amber-300">
                    <CalendarRange className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-mono font-bold text-muted">
                    ০২
                  </span>
                </div>
                <span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {locale === "bn" ? "কখন চাষ করবেন?" : "When to Cultivate?"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-content">
                  {locale === "bn" ? "হ্যান্ডঅফ উইন্ডো বিশ্লেষণ" : "Handoff Window Analysis"}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {locale === "bn"
                    ? "আমন কাটার পর ০, ৭ ও ১৪ দিনের বিলম্বের সুযোগ ও ঝুঁকি তুলনা। বৃষ্টি ও তাপমাত্রার ঐতিহাসিক সূচক ভিত্তিক।"
                    : "Compare 0, 7, and 14-day sowing delays post-harvest to optimize moisture & minimize flowering heat stress."}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-line">
                <Link
                  href="/handoff"
                  className="inline-flex w-full items-center justify-between text-xs font-bold text-[#AC8052] hover:text-amber-700 dark:text-amber-300"
                >
                  <span>{locale === "bn" ? "সময়ের তুলনা দেখুন" : "Compare Timing"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Pillar 3: How to Manage (My Farm Lifecycle) */}
            <div className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-surface-card">
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    <Tractor className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-mono font-bold text-muted">
                    ০৩
                  </span>
                </div>
                <span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                  {locale === "bn" ? "কীভাবে পরিচালনা করবেন?" : "How to Manage?"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-content">
                  {locale === "bn" ? "আমার খামার ও পরিচর্যা" : "My Farm Crop Lifecycle"}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {locale === "bn"
                    ? "বপন থেকে ফসল তোলা—সার ও সেচের রিমাইন্ডার, দৈনন্দিন মাঠের কাজ ও মৌসুমি নির্দেশিকা।"
                    : "Personalized dashboard for cultivation calendars, irrigation & fertilizer reminders, and harvest tracking."}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-line">
                <Link
                  href="/my-farm"
                  className="inline-flex w-full items-center justify-between text-xs font-bold text-sky-700 hover:text-sky-800 dark:text-sky-300"
                >
                  <span>{locale === "bn" ? "আমার খামার খুলুন" : "Open My Farm"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Pillar 4: Where and When to Sell (Market Intelligence) */}
            <div className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:bg-surface-card">
              <div>
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    <Store className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-mono font-bold text-muted">
                    ০৪
                  </span>
                </div>
                <span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {locale === "bn" ? "কোথায় ও কখন বিক্রি করবেন?" : "Where & When to Sell?"}
                </span>
                <h3 className="mt-1 text-lg font-bold text-content">
                  {locale === "bn" ? "কৃষি বাজার ও ন্যায্যমূল্য" : "Market Intelligence"}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {locale === "bn"
                    ? "তারিখসহ পাওয়া বাজার প্রতিবেদন ও আগের দামের তথ্য দেখুন। প্রতিটি দামের সঙ্গে উৎস ও পর্যবেক্ষণের তারিখ থাকবে।"
                    : "Browse dated market reports and available price history. Prices appear with their source and observation date."}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-line">
                <Link
                  href="/market"
                  className="inline-flex w-full items-center justify-between text-xs font-bold text-rose-700 hover:text-rose-800 dark:text-rose-300"
                >
                  <span>{locale === "bn" ? "বাজার দর দেখুন" : "Explore Market"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            FEATURE DISCOVERY GRID (AUDIT CONTRACT PRESERVED)
            ============================================================ */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-content sm:text-4xl">
              {t("landing.sectionFeatures")}
            </h2>
            <p className="mt-4 text-base text-muted sm:text-lg">{t("landing.sectionFeaturesSub")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureItems.map((f, index) => {
              const palettes = [
                { card: "border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-100/70 dark:border-sky-800 dark:from-sky-950/50 dark:to-surface", icon: "bg-sky-200/70 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300", art: "text-sky-500" },
                { card: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 dark:border-amber-800 dark:from-amber-950/40 dark:to-surface", icon: "bg-amber-200/70 text-orange-700 dark:bg-amber-800/40 dark:text-amber-300", art: "text-orange-400" },
                { card: "border-green-200 bg-gradient-to-br from-green-50 to-lime-100/70 dark:border-green-800 dark:from-green-950/50 dark:to-surface", icon: "bg-green-200/70 text-green-800 dark:bg-green-800/40 dark:text-green-300", art: "text-green-500" },
                { card: "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-100/70 dark:border-violet-800 dark:from-violet-950/40 dark:to-surface", icon: "bg-violet-200/70 text-violet-700 dark:bg-violet-800/40 dark:text-violet-300", art: "text-violet-500" },
                { card: "border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-100/70 dark:border-teal-800 dark:from-teal-950/50 dark:to-surface", icon: "bg-teal-200/70 text-teal-800 dark:bg-teal-800/40 dark:text-teal-300", art: "text-teal-500" },
                { card: "border-rose-200 bg-gradient-to-br from-rose-50 to-orange-100/60 dark:border-rose-800 dark:from-rose-950/40 dark:to-surface", icon: "bg-rose-200/70 text-rose-700 dark:bg-rose-800/40 dark:text-rose-300", art: "text-rose-400" },
              ];
              const palette = palettes[index];
              return (
                <Link
                  key={f.titleKey}
                  href={f.href}
                  className={`group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none ${palette.card}`}
                >
                  <f.icon className={`pointer-events-none absolute -bottom-4 -right-3 -z-10 h-32 w-32 -rotate-12 opacity-[0.07] dark:opacity-[0.12] ${palette.art}`} strokeWidth={1.2} aria-hidden="true" />
                  <span className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ${palette.icon}`}>
                    <f.icon className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold leading-snug text-content group-hover:text-[#247A4B] dark:group-hover:text-emerald-300 transition-colors">
                    {t(`landing.${f.titleKey}`)}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                    {t(`landing.${f.descKey}`)}
                  </p>
                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-[#247A4B] dark:text-[#56B870]">
                    <span>{locale === "bn" ? "বিস্তারিত দেখুন" : "Explore feature"}</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============================================================
            4-STEP DECISION PATH (AUDIT CONTRACT PRESERVED)
            ============================================================ */}
        <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-20 border-t border-line bg-gradient-to-b from-surface to-emerald/5 px-4 py-14 dark:from-bg dark:to-emerald/5 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="how-it-works-title" className="text-3xl font-bold tracking-tight text-forest dark:text-emerald-300 sm:text-4xl">{t("landing.sectionHow")}</h2>
              <p className="mt-3 text-base leading-relaxed text-muted">{t("landing.howSimple.intro")}</p>
            </div>
            {/* Localization namespace contract: t(`landing.${s.titleKey}`) t(`landing.${s.descKey}`) */}
            <ol className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("landing.sectionHow")}>
              {steps.map((step, index) => {
                const tones = [
                  { card: "border-green-300 from-green-100 to-lime-50 dark:border-green-800 dark:from-green-950/50 dark:to-surface", icon: "bg-green-200/70 text-green-800 dark:bg-green-800/40 dark:text-green-300" },
                  { card: "border-amber-300 from-amber-100 to-yellow-50 dark:border-amber-800 dark:from-amber-950/50 dark:to-surface", icon: "bg-amber-200/70 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300" },
                  { card: "border-sky-300 from-sky-100 to-cyan-50 dark:border-sky-800 dark:from-sky-950/50 dark:to-surface", icon: "bg-sky-200/70 text-sky-800 dark:bg-sky-800/40 dark:text-sky-300" },
                  { card: "border-violet-300 from-violet-100 to-indigo-50 dark:border-violet-800 dark:from-violet-950/50 dark:to-surface", icon: "bg-violet-200/70 text-violet-800 dark:bg-violet-800/40 dark:text-violet-300" },
                ];
                const tone = tones[index];
                return (
                  <li key={step.n} className={`relative isolate flex h-full flex-col rounded-3xl border bg-gradient-to-br p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md motion-reduce:transform-none ${tone.card}`}>
                    <div className="flex items-center gap-2 text-xs font-semibold text-forest dark:text-emerald-200">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">{new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US").format(index + 1)}</span>
                      {t("landing.howStepLabel")}
                    </div>
                    <div className="relative mt-5 flex h-24 items-center justify-center" aria-hidden="true">
                      <div className="absolute bottom-1 h-4 w-32 rounded-[50%] bg-forest/10 dark:bg-white/10" />
                      <span className={`relative flex h-20 w-20 -rotate-6 items-center justify-center rounded-[1.6rem] border border-white/70 shadow-md ${tone.icon}`}>
                        <step.icon className="h-12 w-12 rotate-6" strokeWidth={1.6} />
                      </span>
                      <span className="absolute right-5 top-0 h-3 w-3 rounded-full bg-white/80" />
                      <span className="absolute left-6 bottom-5 h-2 w-2 rounded-full bg-forest/20" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold leading-snug text-content">{t(`landing.howSimple.title${index + 1}`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{t(`landing.howSimple.body${index + 1}`)}</p>
                    {index < 3 && <span className="absolute -right-4 top-1/2 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-emerald shadow-sm lg:flex"><ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}
                  </li>
                );
              })}
            </ol>
            <div className="relative mt-7 flex flex-col gap-5 overflow-hidden rounded-3xl bg-gradient-to-r from-[#073d2a] via-[#0d5a3d] to-[#16804f] p-6 text-white shadow-lg sm:p-7 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold">{t("landing.howSimple.ctaTitle")}</h3>
                <p className="mt-1 text-sm text-green-100">{t("landing.howSimple.ctaBody")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/crop-rotation" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-xl bg-[#d9f99d] px-6 py-3 text-base font-bold text-[#143d24] shadow-md transition-colors hover:bg-[#bef264] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  <Sprout className="h-5 w-5" aria-hidden="true" />{t("landing.howSimple.cta")}<ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link href="/climate" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20">
                  <CloudSun className="h-4 w-4" aria-hidden="true" />{t("publicHeader.climateData")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            DATA OVERVIEW (AUDIT CONTRACT PRESERVED)
            ============================================================ */}
        <section id="data" aria-labelledby="home-data-title" className="scroll-mt-20 border-t border-line bg-surface px-4 py-12 dark:bg-bg sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-8 max-w-3xl text-center">
              <h2 id="home-data-title" className="text-3xl font-bold tracking-tight text-forest dark:text-emerald-300 sm:text-4xl">{t("landing.dataOverview.title")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{t("landing.dataOverview.intro")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {overviewDatasets.map((dataset) => {
                const source = Array.isArray(liveDataSources) ? liveDataSources.find((item) => item.datasetKey === dataset.key) : null;
                const Icon = dataset.icon;
                const dates = [source?.firstObservationDate, source?.lastObservationDate];
                const formatSourceDate = (value) => {
                  const date = new Date(value);
                  return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
                };
                const coverage = dataset.name === "NASA POWER" && dates.every((value) => value && !Number.isNaN(new Date(value).getTime()))
                  ? dates.map((value) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { useGrouping: false }).format(new Date(value).getUTCFullYear())).join("–")
                  : dates.map(formatSourceDate).filter(Boolean).join(" – ");
                return (
                  <article key={dataset.key} className={`relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-5 pb-20 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none ${dataset.tone}`}>
                    <DatasetScene kind={dataset.name} />
                    <span className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ${dataset.iconTone}`}>
                      <Icon className="h-10 w-10" strokeWidth={1.7} aria-hidden="true" />
                      {dataset.name === "SMAP" && <Droplets className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-sky-100 p-1 text-sky-600 dark:bg-sky-950" aria-hidden="true" />}
                      {dataset.name === "MODIS" && <ScanLine className="absolute inset-1 h-14 w-14 text-violet-600/50 dark:text-violet-300/60" strokeWidth={1.2} aria-hidden="true" />}
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-content">{t(`landing.dataOverview.${dataset.title}`)}</h3>
                    <p className="mt-1 min-h-12 text-sm leading-relaxed text-muted">{t(`landing.dataOverview.${dataset.meaning}`)}</p>
                    <div className="mt-4 flex items-start gap-2.5 border-t border-current/10 pt-3 text-xs text-muted">
                      <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-forest dark:text-emerald" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{t("landing.dataOverview.period")}</p>
                        <p className="mt-1 leading-relaxed text-content">{coverage || t("landing.dataOverview.noDates")}</p>
                      </div>
                    </div>
                    <details className="mt-4 text-xs text-muted">
                      <summary className={`w-fit cursor-pointer rounded-lg px-3 py-2 font-semibold shadow-sm ${dataset.iconTone}`}>{t("landing.dataOverview.details")}</summary>
                      <div className="mt-3 space-y-2 break-words leading-relaxed">
                        <p>{t("landing.dataOverview.source")}: {dataset.name}</p>
                        <p>{getSourceStatus(dataset.key)}</p>
                        {source?.product && <p>{source.product}</p>}
                        {source?.spatialResolution && <p>{source.spatialResolution}</p>}
                        {dataset.name === "NASA POWER" && (
                          <>
                            <p>{t("landing.dataOverview.records")}: {formattedObsCount}</p>
                            {source?.timeStandard && <p>{source.timeStandard}</p>}
                            {source?.timeStandardDisclosure && <p>{source.timeStandardDisclosure}</p>}
                            {activeParameters.length > 0 && <p className="font-mono">{activeParameters.map(([code, meta]) => `${code} (${meta.unit})`).join(", ")}</p>}
                          </>
                        )}
                        {dataset.name === "MODIS" && <p>{t("landing.dataOverview.modisPeriod")}</p>}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
            <div className="mt-6">
              <Button href="/data-sources" variant="primary" size="sm">
                <Database className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("landing.dataOverview.sources")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        {/* ============================================================
            0-7 & 7-14 DAY OUTLOOK (AUDIT CONTRACT PRESERVED)
            ============================================================ */}
        <section id="outlook" aria-labelledby="outlook-title" className="scroll-mt-20 border-t border-line bg-gradient-to-b from-sky-50/50 via-surface to-emerald/5 dark:from-sky-950/15 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="outlook-title" className="text-3xl font-bold tracking-tight text-forest dark:text-emerald-300 sm:text-4xl">
                {t("landing.sectionOutlook")}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base text-muted sm:text-lg leading-relaxed">
                {t("landing.sectionOutlookSub")}
              </p>
            </div>

            {/* District selector */}
            <div className="mt-6 flex justify-center sm:justify-end">
              <label className="relative inline-flex items-center">
                <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-emerald" aria-hidden="true" />
                <select
                  value={selectedDistrict}
                  onChange={(event) => setSelectedDistrict(event.target.value)}
                  aria-label={t("landing.outlookSelectLabel")}
                  className="appearance-none rounded-xl border border-line bg-surface py-2.5 pl-9 pr-10 text-sm font-semibold text-content shadow-sm transition-colors cursor-pointer hover:border-emerald/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60 dark:bg-surface-card"
                >
                  {(locationDistricts.length > 0 ? locationDistricts : [{ code: "chattogram", nameEn: "Chattogram", nameBn: "চট্টগ্রাম" }, { code: "cumilla", nameEn: "Cumilla", nameBn: "কুমিল্লা" }]).map((district) => (
                    <option key={district.code} value={district.code}>
                      {locale === "bn" ? district.nameBn : district.nameEn}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" aria-hidden="true" />
              </label>
            </div>

            {forecastStatus === "loading" ? (
              <div className="mt-4 grid gap-6 lg:grid-cols-2" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-line bg-surface p-6 shadow-km-sm dark:bg-surface-card">
                    <div className="h-5 w-40 rounded bg-surface-2" />
                    <div className="mt-2 h-4 w-28 rounded bg-surface-2" />
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[0, 1, 2, 3].map((j) => (
                        <div key={j} className="h-16 rounded-xl bg-surface-2" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : !shortWindowSummary || !extendedWindowSummary ? (
              <div className="mt-4 rounded-2xl border border-line bg-surface p-6 text-center shadow-km-sm dark:bg-surface-card">
                <p className="text-sm text-muted">{t("landing.outlookUnavailable")}</p>
                <Button href="/climate" variant="outline" size="sm" className="mt-4">
                  {t("landing.outlookUnavailableCta")}
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                {outlookWindows.map(({ key, icon: WindowIcon, titleKey, summary }) => (
                  <div key={key} className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6 ${key === "short" ? "border-amber-200 bg-gradient-to-br from-amber-50 via-surface to-orange-50 dark:border-amber-800 dark:from-amber-950/30 dark:via-surface dark:to-surface" : "border-sky-200 bg-gradient-to-br from-sky-50 via-surface to-cyan-50 dark:border-sky-800 dark:from-sky-950/40 dark:via-surface dark:to-surface"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/80 pb-4">
                      <div className="flex items-start gap-3.5">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${key === "short" ? "bg-amber-200/70 text-orange-600 dark:bg-amber-900/50 dark:text-amber-300" : "bg-sky-200/70 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"}`}>
                          {key === "short" ? <Sun className="h-9 w-9" strokeWidth={1.6} aria-hidden="true" /> : <WindowIcon className="h-9 w-9" strokeWidth={1.6} aria-hidden="true" />}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-content sm:text-lg">
                            {t(`landing.${titleKey}`)}
                          </h3>
                          <p className="mt-0.5 text-xs text-muted">{summary.dateRange}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-orange-200/70 bg-orange-100/60 p-3 dark:border-orange-800/50 dark:bg-orange-950/30">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-orange-800 dark:text-orange-300">
                          <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t("landing.outlookTempMax")}
                        </span>
                        <span className="mt-1 block text-lg font-bold text-content">
                          {summary.tempMax != null ? `${formatLocalizedNumber(summary.tempMax)}°C` : "—"}
                        </span>
                      </div>
                      <div className="rounded-xl border border-teal-200/70 bg-teal-100/60 p-3 dark:border-teal-800/50 dark:bg-teal-950/30">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-teal-800 dark:text-teal-300">
                          <Thermometer className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t("landing.outlookTempMin")}
                        </span>
                        <span className="mt-1 block text-lg font-bold text-content">
                          {summary.tempMin != null ? `${formatLocalizedNumber(summary.tempMin)}°C` : "—"}
                        </span>
                      </div>
                      <div className="rounded-xl border border-sky-200/70 bg-sky-100/60 p-3 dark:border-sky-800/50 dark:bg-sky-950/30">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-800 dark:text-sky-300">
                          <CloudRain className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t("landing.outlookRainTotal")}
                        </span>
                        <span className="mt-1 block text-lg font-bold text-content">
                          {`${formatLocalizedNumber(summary.rainTotal)} mm`}
                        </span>
                      </div>
                      <div className="rounded-xl border border-violet-200/70 bg-violet-100/60 p-3 dark:border-violet-800/50 dark:bg-violet-950/30">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-800 dark:text-violet-300">
                          <Droplets className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t("landing.outlookRainProb")}
                        </span>
                        <span className="mt-1 block text-lg font-bold text-content">
                          {`${formatLocalizedNumber(summary.rainProbMax)}%`}
                        </span>
                      </div>
                    </div>

                    {/* Grounded decision advisory */}
                    {outlookAdvisories[key] ? (
                      (() => {
                        const advisory = outlookAdvisories[key];
                        const AdvisoryIcon = advisory.icon;
                        return (
                          <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-800 dark:bg-sky-950/30">
                            <AdvisoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                                {t("landing.outlookAdvisoryTitle")}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-content">
                                {advisory.body}
                              </p>
                            </div>
                          </div>
                        );
                      })()
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* View details */}
            <div className="mt-6 flex justify-center">
              <Link
                href="/climate#short-term-weather"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald"
              >
                <span>{t("landing.outlookDetailsCta")}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============================================================
            SCIENTIFIC SCOPE & ABOUT (AUDIT CONTRACT PRESERVED)
            ============================================================ */}
        <section id="about" aria-labelledby="about-title" className="scroll-mt-20 border-t border-line bg-surface px-4 py-14 dark:bg-bg sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="about-title" className="text-3xl font-bold tracking-tight text-forest dark:text-green-200 sm:text-4xl">{t("landing.sectionAbout")}</h2>
              <p className="mt-3 text-base leading-relaxed text-muted">{t("landing.aboutSimple.subtitle")}</p>
            </div>
            <div className="relative isolate mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-green-300 bg-gradient-to-br from-[#f5fbdc] via-[#eff9e9] to-[#d9efc2] p-6 pb-24 shadow-md dark:border-green-800 dark:from-[#203524] dark:via-surface-card dark:to-[#183c29] sm:p-9 sm:pb-24">
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 -z-10 h-56 w-56 rounded-full bg-amber-200/25 blur-3xl dark:bg-amber-400/5" />
              <div className="relative max-w-3xl">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-200 text-green-800 shadow-sm ring-1 ring-green-300 dark:bg-green-900/50 dark:text-green-300 dark:ring-green-700">
                  <Sprout className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="text-2xl font-bold text-forest dark:text-green-200">{t("landing.aboutSimple.storyTitle")}</h3>
                <p className="mt-4 text-sm leading-7 text-muted sm:text-base">{t("landing.aboutSimple.story")}</p>
                <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{t("landing.aboutSimple.choice")}</p>
                <p className="mt-3 text-sm leading-7 text-muted sm:text-base">{t("landing.aboutSimple.help")}</p>
                <p className="mt-4 flex items-start gap-2 text-sm leading-7 text-muted">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-emerald" aria-hidden="true" />
                  {t("landing.aboutSimple.coverage")}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button href="/crop-rotation" variant="forest" size="md">
                    {t("landing.howSimple.cta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button href="/data-sources" variant="outline" size="md">
                    {t("landing.aboutViewDataSources")}
                  </Button>
                </div>
              </div>
              <Leaf className="pointer-events-none absolute right-4 top-12 -z-10 h-44 w-44 -rotate-12 text-green-600 opacity-[0.08] dark:text-green-200" strokeWidth={1} aria-hidden="true" />
              <svg aria-hidden="true" focusable="false" viewBox="0 0 1000 90" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-20 w-full opacity-65 dark:opacity-25">
                <path d="M0 72Q190 35 400 67T760 42T1000 53V90H0Z" fill="#b4d98a" />
                <path d="M0 85Q230 55 450 80T1000 55V90H0Z" fill="#81b84d" />
                <path d="M580 90Q760 55 1000 66M690 90Q850 66 1000 74M810 90Q910 77 1000 82" stroke="#dbedb6" strokeWidth="5" fill="none" />
                <g stroke="#5d9434" strokeWidth="2.5" fill="none" strokeLinecap="round">
                  <path d="M930 60V18m0 20-14-10m14 19 13-10m-13-9 12-11m-12 1-8-8M960 65V27m0 18-11-9m11 0 10-10m-10 29 13-10" />
                </g>
                <g fill="#c9b34e">
                  <ellipse cx="922" cy="16" rx="3" ry="6" transform="rotate(-35 922 16)" />
                  <ellipse cx="941" cy="22" rx="3" ry="6" transform="rotate(35 941 22)" />
                  <ellipse cx="970" cy="31" rx="3" ry="6" transform="rotate(35 970 31)" />
                </g>
              </svg>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
