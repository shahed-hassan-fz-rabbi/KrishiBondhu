"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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
  fetchMarketPriceHistory,
  fetchVerifiedMarketPriceCatalog,
  fetchSoilMoistureLatest,
} from "@/services/api.js";
import { PublicHeader, PublicFooter } from "@/components/layout/PublicChrome.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { Card, CardBody, CardHeader } from "@/components/ui/Card.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useLocation } from "@/contexts/LocationContext.js";

/** Featured service cards (part 2). Icon order mirrors the design system; hrefs target existing routes. */
const featuredCards = [
  { icon: Store, objKey: "cardMarket", href: "/market", image: "/img/photos/market-produce.jpg" },
  { icon: TrendingUp, objKey: "cardForecast", href: "/market", image: "/img/photos/price-forecasting.jpg" },
  { icon: CloudSun, objKey: "cardWeather", href: "/climate", image: "/img/photos/weather-climate.jpg" },
  { icon: Tractor, objKey: "cardCrops", href: "/crop-rotation", image: "/img/photos/crop-rotation-cycle.jpg" },
  { icon: MessageSquare, objKey: "cardAssistant", href: "/assistant", image: "/img/photos/ai-assistant.avif" },
  { icon: Globe, objKey: "cardMap", href: "/map", image: "/img/photos/nasa-modis-bangladesh.jpg" },
  { icon: Bookmark, objKey: "cardAdvisories", href: "/saved-advisories", image: "/img/farmer-call.svg" },
  { icon: Tractor, objKey: "cardMyFarm", href: "/my-farm", image: "/img/photos/farmer-rajshahi.jpg" },
  { icon: Database, objKey: "cardData", href: "/data-sources", image: "/img/photos/trusted-agri-data.jpg" },
];

const overviewDatasets = [
  {
    name: "NASA POWER",
    title: "powerTitle",
    key: "nasa:power:daily:point",
    meaning: "powerMeaning",
    image: "/img/photos/data-rainfall-temperature.avif",
    icon: Satellite,
    tone: "border-green-300 bg-gradient-to-br from-green-50 via-green-50/60 to-lime-100 dark:border-green-800 dark:from-green-950 dark:via-surface dark:to-green-900/40",
    iconTone: "bg-green-200/60 text-green-800 dark:bg-green-800/40 dark:text-green-300",
  },
  {
    name: "SMAP",
    title: "soilTitle",
    key: "nasa:smap:spl3smp_e:v006",
    meaning: "soilMeaning",
    image: "/img/photos/data-soil-moisture.jpg",
    icon: Sprout,
    tone: "border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100 dark:border-amber-800 dark:from-amber-950/50 dark:via-surface dark:to-amber-900/30",
    iconTone: "bg-amber-200/60 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300",
  },
  {
    name: "GPM",
    title: "rainTitle",
    key: "nasa:gpm:imerg:3imerghh:v07",
    meaning: "rainMeaning",
    image: "/img/photos/data-rainfall-observations.jpg",
    icon: CloudRain,
    tone: "border-sky-300 bg-gradient-to-br from-sky-50 via-sky-50/70 to-cyan-100 dark:border-sky-800 dark:from-sky-950 dark:via-surface dark:to-sky-900/40",
    iconTone: "bg-sky-200/60 text-sky-700 dark:bg-sky-800/40 dark:text-sky-300",
  },
  {
    name: "MODIS",
    title: "vegetationTitle",
    key: "nasa:modis:mod13q1:v061",
    meaning: "greenMeaning",
    image: "/img/photos/data-vegetation-condition.jpg",
    icon: Leaf,
    tone: "border-violet-300 bg-gradient-to-br from-violet-50 via-violet-50/60 to-indigo-100 dark:border-violet-800 dark:from-violet-950/60 dark:via-surface dark:to-violet-900/30",
    iconTone: "bg-violet-200/60 text-green-700 dark:bg-violet-800/40 dark:text-green-300",
  },
];

const steps = [
  { n: "01", icon: MapPin, titleKey: "step1Title", descKey: "step1Desc" },
  { n: "02", icon: Sprout, titleKey: "step2Title", descKey: "step2Desc" },
  { n: "03", icon: BarChart3, titleKey: "step3Title", descKey: "step3Desc" },
  { n: "04", icon: CalendarRange, titleKey: "step4Title", descKey: "step4Desc" },
];

const workflowCards = [
  { icon: Satellite, image: "/img/photos/nasa-modis-bangladesh.jpg", titleBn: "তথ্য কোথা থেকে আসে", titleEn: "Where the information comes from", bodyBn: "আবহাওয়া, জলবায়ু, উপগ্রহ ও বাজারের তথ্য তাদের উৎস এবং তারিখসহ এক জায়গায় দেখানো হয়।", bodyEn: "Weather, climate, satellite and market information is presented with its source and date.", detailBn: "পূর্বাভাস, ঐতিহাসিক রেকর্ড ও স্যাটেলাইট পর্যবেক্ষণ আলাদা ধরনের তথ্য। কোন উৎস কোন এলাকা ও সময়কে বোঝায় তা দেখে ব্যবহার করুন।", detailEn: "Forecasts, historical records and satellite observations are different kinds of information. Check each source’s area and time coverage before using it.", tagsBn: "NASA POWER · SMAP · MODIS", tagsEn: "NASA POWER · SMAP · MODIS", href: "/data-sources", linkBn: "তথ্যের উৎস দেখুন", linkEn: "Explore data sources" },
  { icon: MapPin, image: "/img/photos/soil-moisture-card.jpg", titleBn: "জমির তথ্য যোগ করুন", titleEn: "Add your field context", bodyBn: "জেলা, মাটি, পানি এবং বর্তমানে যে ফসলের পর যে ফসল করেন—সেই তথ্য দিন।", bodyEn: "Enter your district, soil and water context, and the crops you currently grow in sequence.", detailBn: "যা জানা আছে শুধু সেটিই দিন। মাটি বা সেচের তথ্য অজানা হলে সেটি অজানাই থাকবে; সিস্টেম নিজে থেকে ধরে নেবে না।", detailEn: "Share what you know. Unknown soil or irrigation details stay unknown; the system does not assume them.", tagsBn: "জেলা · মাটি · ফসলের ক্রম", tagsEn: "District · Soil · Crop sequence", href: "/crop-rotation", linkBn: "পরিকল্পনা শুরু করুন", linkEn: "Start planning" },
  { icon: Sprout, image: "/img/photos/transplanting.jpg", titleBn: "বিকল্পগুলো মিলিয়ে দেখুন", titleEn: "Compare the alternatives", bodyBn: "বর্তমান পদ্ধতির সঙ্গে ফসল পর্যায়ক্রম ও বপনের সময়ের বিকল্প তুলনা করুন।", bodyEn: "Compare crop sequences and sowing-time options against your current plan.", detailBn: "ফসল পঞ্জিকার সময়ের সংঘাত, তাপমাত্রা যাচাইয়ের প্রয়োজন ও অনুপস্থিত তথ্যও ফলাফলে দেখানো হয়। এই তুলনা ফলন বা আয়ের নিশ্চয়তা নয়।", detailEn: "Results also flag possible calendar conflicts, temperature checks and missing data. The comparison does not guarantee yield or income.", tagsBn: "ফসল পঞ্জিকা · সময় · সতর্কতা", tagsEn: "Crop calendars · Timing · Checks", href: "/crop-rotation", linkBn: "ফসল তুলনা করুন", linkEn: "Compare crops" },
  { icon: MessageSquare, image: "/img/photos/agricultural-field-guidance.jpg", titleBn: "AI সহায়তা নিয়ে সিদ্ধান্ত নিন", titleEn: "Use AI support, then decide", bodyBn: "বাংলা বা ইংরেজিতে প্রশ্ন করে উপলভ্য তথ্য ও ফলাফল সহজভাবে বুঝে নিন।", bodyEn: "Ask in Bangla or English to get help understanding available information and results.", detailBn: "সহকারী উৎসসহ তথ্য ব্যাখ্যা করতে পারে, তবে আপনার জমি সরাসরি পরীক্ষা করে না এবং আপনার হয়ে চাষের সিদ্ধান্ত নেয় না। স্থানীয় কৃষি কর্মকর্তার পরামর্শে মাঠের অবস্থা যাচাই করুন।", detailEn: "The assistant can explain information with sources, but it does not inspect your field or make the farming decision for you. Check local conditions with an agricultural officer.", tagsBn: "বাংলা সহকারী · স্থানীয় যাচাই", tagsEn: "Bangla assistant · Local review", href: "/assistant", linkBn: "সহকারীকে জিজ্ঞাসা করুন", linkEn: "Ask the assistant" },
];

export default function LandingPage() {
  const { t, locale } = useLang();
  const { selectedDistrict, setSelectedDistrict, districts: locationDistricts } = useLocation();
  const [liveDataSources, setLiveDataSources] = useState(null);
  const [hasLoadedDataSources, setHasLoadedDataSources] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastStatus, setForecastStatus] = useState("loading");
  const [marketCatalog, setMarketCatalog] = useState(null);
  const [marketDataStatus, setMarketDataStatus] = useState(null);
  const [marketObservations, setMarketObservations] = useState({});
  const [marketObservationsStatus, setMarketObservationsStatus] = useState("loading");
  const [soilMoistureResult, setSoilMoistureResult] = useState({ district: null, status: "loading", data: null });

  const [activePreviewTab, setActivePreviewTab] = useState("market"); // "market" | "weather" | "planner" | "assistant"

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
    ]).then(async ([statusRes, catalogRes]) => {
      if (isCancelled) return;
      if (statusRes.status === "fulfilled" && statusRes.value?.data) {
        setMarketDataStatus(statusRes.value.data);
      }
      if (catalogRes.status === "fulfilled" && catalogRes.value?.data) {
        const catalog = catalogRes.value.data;
        setMarketCatalog(catalog);
        const series = (catalog.series || []).slice(0, 4);
        const observations = await Promise.allSettled(series.map((item) => fetchMarketPriceHistory({
          commodity: item.commodity,
          division: item.division,
          priceType: item.priceType,
          frequency: item.frequency,
          unit: item.unit,
        })));
        if (isCancelled) return;
        const bySeries = {};
        let lookupFailed = false;
        observations.forEach((result, index) => {
          if (result.status !== "fulfilled" || !result.value?.success) {
            lookupFailed = true;
            return;
          }
          const row = result.value?.data?.observations?.at(-1);
          if (row) {
            const timestamp = new Date(`${row.observedOn}T00:00:00Z`).getTime();
            const ageDays = Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000)) : null;
            bySeries[`${series[index].commodity}|${series[index].division}|${series[index].priceType}|${series[index].unit}`] = { ...row, ageDays };
          }
        });
        setMarketObservations(bySeries);
        setMarketObservationsStatus(lookupFailed ? "unavailable" : "ready");
      } else if (catalogRes.status === "fulfilled") {
        setMarketObservationsStatus("unavailable");
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
        if (isCancelled) return;
        if (res?.success && Number.isFinite(res?.data?.soilMoisture)) {
          setSoilMoistureResult({ district: selectedDistrict, data: res.data, status: "ready" });
        } else {
          setSoilMoistureResult({ district: selectedDistrict, data: null, status: "unavailable" });
        }
      })
      .catch(() => {
        if (!isCancelled) setSoilMoistureResult({ district: selectedDistrict, data: null, status: "unavailable" });
      });
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
    const rainValues = days
      .map((d) => d.precipitationSumMm == null ? NaN : Number(d.precipitationSumMm))
      .filter(Number.isFinite);
    const rainTotal = rainValues.length ? rainValues.reduce((sum, value) => sum + value, 0) : null;
    const rainProbabilities = days
      .map((d) => d.precipitationProbabilityMax == null ? NaN : Number(d.precipitationProbabilityMax))
      .filter(Number.isFinite);
    const rainProbMax = rainProbabilities.length ? Math.max(...rainProbabilities) : null;
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
      rainTotal: rainTotal == null ? null : Math.round(rainTotal * 10) / 10,
      rainDays: rainValues.length ? rainValues.filter((value) => value > 0).length : null,
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

    const observedRain = days
      .map((d) => d.precipitationSumMm == null ? NaN : Number(d.precipitationSumMm))
      .filter(Number.isFinite);
    const heavyRainDays = days.filter((d) => Number.isFinite(Number(d.precipitationSumMm)) && Number(d.precipitationSumMm) >= 10).length;
    const dryWorkableDays = days.filter((d) => Number.isFinite(Number(d.precipitationSumMm)) && Number(d.precipitationSumMm) < 1).length;
    const maxGust = Math.max(...days.map((d) => Number(d.windGustsMaxKmH) || 0));

    let category;
    if ((summary.rainTotal != null && summary.rainTotal >= 22) || (summary.rainProbMax != null && summary.rainProbMax >= 60) || heavyRainDays >= 2) {
      category = "wet";
    } else if (maxGust >= 40) {
      category = "wind";
    } else if (summary.tempMax != null && summary.tempMax >= 36) {
      category = "heat";
    } else if (summary.tempMin != null && summary.tempMin < 10) {
      category = "cold";
    } else if (summary.rainTotal != null && observedRain.length === days.length && summary.rainTotal < 5 && summary.rainProbMax != null && summary.rainProbMax < 40 && dryWorkableDays >= 4) {
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

  const formatObservationFreshness = (date, ageDays) => {
    if (!date) return locale === "bn" ? "তারিখ নেই" : "Date unavailable";
    if (!Number.isFinite(ageDays)) return locale === "bn" ? `পর্যবেক্ষণ ${date}` : `Observed on ${date}`;
    return locale === "bn" ? `${formatLocalizedNumber(ageDays)} দিন আগে পর্যবেক্ষিত` : `Observed ${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
  };

  const currentSoilMoisture = soilMoistureResult.district === selectedDistrict ? soilMoistureResult.data : null;
  const soilMoistureStatus = soilMoistureResult.district === selectedDistrict ? soilMoistureResult.status : "loading";

  const cardData = (objKey) => ({
    title: t(`landing.${objKey}.title`),
    desc: t(`landing.${objKey}.desc`),
    link: locale === "bn" ? t(`landing.${objKey}.linkBn`) : t(`landing.${objKey}.link`),
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".kb-reveal").forEach((el) => observer.observe(el));
  }, []);

  return (
    <div className="kb-story-home flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* ============================================================
            HERO SECTION (Mati Kohon structural composition parity)
            ============================================================ */}
        <section className="kb-hero2" id="home">
          <div className="kb-hero2-bg" aria-hidden="true">
            <Image src="/img/agri-field-background.webp" alt="" width={1280} height={720} className="h-full w-full object-cover" priority />
          </div>
          <div className="kb-hero2-gradient" aria-hidden="true" />
          <div className="kb-hero2-inner">
            <div className="kb-hero2-copy">
              <h1 id="home-title" data-tour-target="home.hero" className="kb-hero2-title">
                <span className="block">{t(`landing.heroHeadlineLine1`)}</span>
                <span className="kb-hero2-line2 block"><em className="kb-hero2-highlight">{t(`landing.heroHeadlineLine2`)}</em></span>
              </h1>

              <p className="kb-hero2-desc">
                {locale === "bn"
                  ? "বাজারের তারিখযুক্ত প্রতিবেদন, আবহাওয়ার পূর্বাভাস, ঐতিহাসিক জলবায়ু প্রেক্ষাপট ও ফসল পরিকল্পনার সরঞ্জাম এক জায়গায়—তথ্যের উৎস ও সীমাবদ্ধতাসহ।"
                  : "Explore dated market reports, weather forecasts, historical climate context, and crop-planning tools together, with source and coverage details."}
              </p>

              <div className="kb-hero2-actions">
                <Link href="/dashboard" className="kb-hero2-card kb-hero2-card-primary">
                  <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{locale === "bn" ? "লগইন ছাড়া ঘুরে দেখুন" : "Explore without login"}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 ml-auto" aria-hidden="true" />
                </Link>
                <Link href="/crop-rotation" className="kb-hero2-card kb-hero2-card-secondary">
                  <Sprout className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{locale === "bn" ? "ফসল পর্যায় ও আবহাওয়া" : "Crop Rotation & Weather"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("krishi:tour-start", { detail: { restart: true } }));
                    }
                  }}
                  className="kb-hero2-cta-tour"
                  aria-label={locale === "bn" ? "বন্ধুর সাথে পুরো সফর" : "Tour with Bondhu"}
                >
                  <Play className="h-4 w-4 shrink-0 fill-current text-forest" aria-hidden="true" />
                  <span>{locale === "bn" ? "বন্ধুর সাথে পুরো সফর" : "Tour with Bondhu"}</span>
                </button>
                <Link href="/market" className="text-xs font-semibold text-forest hover:underline">
                  {locale === "bn" ? t("landing.ctaMarketBn") : t("landing.ctaMarket")} &rarr;
                </Link>
              </div>

              <div className="kb-hero2-proof">
                <div className="kb-hero2-proof-item">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {locale === "bn"
                      ? "পাওয়া তথ্যের সঙ্গে উৎস ও পর্যবেক্ষণের তারিখ দেখুন।"
                      : "Review available information with its source and observation date."}
                  </span>
                </div>
                <div className="kb-hero2-proof-item">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {locale === "bn"
                      ? "নির্দেশিকা সফর যেকোনো সময় থামান বা আবার শুরু করুন।"
                      : "Pause, skip, or replay the guided tour at any time."}
                  </span>
                </div>
              </div>
            </div>

            {/* Empty hero stage gives Bondhu a measured first-visit landing area. */}
            <div className="kb-hero2-card-stage" id="landingBondhuStage" data-bondhu-anchor="home-hero" aria-hidden="true" />
          </div>
        </section>

        {/* The workflow comes before service discovery and previews so visitors
            can understand the farmer journey before exploring individual tools. */}
        <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-24 bg-bg px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-strong">{locale === "bn" ? "কৃষিবন্ধুর কর্মধারা" : "THE KRISHIBONDHU WORKFLOW"}</p>
              <h2 id="how-it-works-title" className="mt-3 text-3xl font-extrabold tracking-tight text-forest dark:text-green-100 sm:text-4xl">{locale === "bn" ? "তথ্য থেকে কৃষিকাজের সিদ্ধান্তে" : "From information to field action"}</h2>
              <p className="mt-3 text-base leading-7 text-muted">{locale === "bn" ? "প্রতিটি ধাপে কীভাবে সাহায্য করে জানতে card-এর বিস্তারিত খুলুন।" : "Open a card to see how each step can help."}</p>
            </div>
            <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {workflowCards.map(({ icon: Icon, image, titleBn, titleEn, bodyBn, bodyEn, detailBn, detailEn, tagsBn, tagsEn, href, linkBn, linkEn }, index) => (
                <article key={titleEn} className="kb-flow-card group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
                  <div className="relative h-48 overflow-hidden">
                    <Image src={image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute left-4 top-4 rounded-lg bg-[#123d2a]/90 px-3 py-1.5 text-xs font-extrabold tracking-wide text-white backdrop-blur">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald/10 text-emerald-strong"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <h3 className="mt-4 text-lg font-bold text-forest dark:text-green-100">{locale === "bn" ? titleBn : titleEn}</h3>
                    <p className="mt-2 min-h-[76px] text-sm leading-6 text-muted">{locale === "bn" ? bodyBn : bodyEn}</p>
                    <span className="mt-4 inline-flex w-fit rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">{locale === "bn" ? tagsBn : tagsEn}</span>
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="text-sm leading-7 text-muted">{locale === "bn" ? detailBn : detailEn}</p>
                      <Link href={href} className="kb-flow-link mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-strong hover:underline">{locale === "bn" ? linkBn : linkEn}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            FEATURED SERVICES (Feature discovery — modern)
            ============================================================ */}
        <section className="kb-featured" id="features">
          <h2 className="kb-featured-eyebrow">{locale === "bn" ? t("landing.featureDiscoveryTitle") : "Core services for your field"}</h2>
          <p className="kb-featured-desc">{locale === "bn" ? t("landing.featureDiscoverySub") : "Market, forecasting, weather, crop rotation and planning—designed for Bangladeshi farmers."}</p>
          <div className="kb-featured-grid">
            {featuredCards.map((card) => {
              const data = cardData(card.objKey);
              return (
                <a key={card.objKey} href={card.href} className="kb-featured-card">
                  <span className={`kb-featured-visual ${card.objKey === "cardAssistant" ? "kb-featured-visual-ai" : ""}`} aria-hidden="true">
                    <Image src={card.image} alt="" width={640} height={400} />
                    {card.objKey === "cardAssistant" && (
                      <span className="kb-featured-ai-overlay">
                        <span className="kb-featured-ai-badge"><Sparkles className="h-3.5 w-3.5" />Krishi AI</span>
                        <span className="kb-featured-ai-chat"><MessageSquare className="h-4 w-4" /><span><i /><i /><i /></span></span>
                      </span>
                    )}
                  </span>
                  <span className="kb-featured-icon"><card.icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" /></span>
                  <span className="kb-featured-title-2">{data.title}</span>
                  <span className="kb-featured-body">{data.desc}</span>
                  <span className="kb-featured-link">{data.link} <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </a>
              );
            })}
          </div>
        </section>

        {/* ============================================================
            INTERACTIVE APPLICATION PREVIEWS (Agricultural Tools & Workflows)
            ============================================================ */}
        <section id="interactive-previews" className="kb-reveal mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-3xl font-extrabold tracking-tight text-forest dark:text-green-100 sm:text-4xl">
              {locale === "bn" ? t("landing.previewsTitle") : "Explore Application Previews"}
            </h2>
            <p className="mt-3 text-base text-muted">
              {t("landing.previewsSub")}
            </p>
          </div>

          {/* Interactive Tab Switcher */}
          <div className="flex max-w-full justify-center mb-8 pb-2">
            <div className="inline-flex max-w-full flex-wrap justify-center p-1.5 rounded-full border border-line bg-surface-2 shadow-sm gap-1">
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
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-bold transition-all duration-200 ease-out cursor-pointer ${
                    activePreviewTab === tab.id
                      ? "bg-forest text-white shadow-md"
                      : "text-muted hover:text-content hover:bg-surface-2"
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
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md kb-reveal">
              <div className="kb-preview-tab-banner" aria-hidden="true">
                <Image src="/img/photos/market-community-banner.png" alt="" width={938} height={185} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#247A4B]">
                    <span className="h-2 w-2 rounded-full bg-[#247A4B]" />
                    <span>{locale === "bn" ? "যাচাইকৃত বাজার পর্যবেক্ষণ" : "Verified market observations"}</span>
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
                <>
                {marketDataStatus?.latestVerifiedDailyObservation && (
                  <p className="mb-4 rounded-xl border border-line bg-surface-2/60 p-3 text-xs text-muted">
                    {locale === "bn" ? "সর্বশেষ যাচাইকৃত দৈনিক পর্যবেক্ষণ: " : "Latest verified daily observation: "}
                    {marketDataStatus.latestVerifiedDailyObservation.observedOn} · {marketDataStatus.latestVerifiedDailyObservation.source || "DAM"} · {formatObservationFreshness(marketDataStatus.latestVerifiedDailyObservation.observedOn, marketDataStatus.latestVerifiedDailyObservation.ageDays)}
                    {marketDataStatus.latestVerifiedDailyObservation.stale ? (locale === "bn" ? " · পুরোনো তথ্য" : " · Stale observation") : ""}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {marketCatalog.series.slice(0, 4).map((item) => (
                    <div key={`${item.commodity}-${item.division}`} className="rounded-2xl border border-line bg-surface-2/60 p-4 hover:border-emerald/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-sm text-content">{item.commodity}</p>
                        <span className="inline-flex items-center rounded-md bg-emerald/10 px-2 py-0.5 text-[10px] font-bold text-emerald">
                          {item.division || "National"}
                        </span>
                      </div>
                      {(() => {
                        const observation = marketObservations[`${item.commodity}|${item.division}|${item.priceType}|${item.unit}`];
                        return observation ? (
                          <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
                            <p className="text-sm font-bold text-content">
                              ৳{observation.priceMin === observation.priceMax ? observation.priceMin : `${observation.priceMin}–${observation.priceMax}`} / {observation.unit}
                            </p>
                            <p className="mt-1 text-[11px] text-muted">
                              {(locale === "bn" ? "ধরন: " : "Price type: ")}{observation.priceType} · {(locale === "bn" ? "তারিখ: " : "Observed: ")}{observation.observedOn}
                            </p>
                            <p className="text-[11px] text-muted">
                              {(locale === "bn" ? "উৎস: " : "Source: ")}{observation.source || item.sources?.[0] || "DAM"} · {formatObservationFreshness(observation.observedOn, observation.ageDays)}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 rounded-lg border border-dashed border-line p-2.5 text-xs text-muted">
                            {marketObservationsStatus === "loading"
                              ? (locale === "bn" ? "যাচাইকৃত পর্যবেক্ষণ খোঁজা হচ্ছে…" : "Looking up verified observations…")
                              : marketObservationsStatus === "unavailable"
                                ? (locale === "bn" ? "যাচাইকৃত দর আনা যাচ্ছে না।" : "Verified quotes could not be loaded.")
                                : (locale === "bn" ? "এই শ্রেণির সর্বশেষ যাচাইকৃত দর পাওয়া যায়নি।" : "No verified quote was found for this series.")}
                          </p>
                        );
                      })()}
                      <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "দরের ধরন · একক" : "Price type · Unit"}</span>
                          <span className="text-sm font-semibold text-content">{item.priceType || "—"} · {item.unit || "—"}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "সিরিজের সর্বশেষ তারিখ" : "Series last observed"}</span>
                          <span className="text-xs font-semibold text-content">{item.lastObservedOn || (locale === "bn" ? "তারিখ নেই" : "Date unavailable")}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between text-[10px] text-muted">
                        <span>{locale === "bn" ? "পর্যবেক্ষণ সংখ্যা" : "Observations"}: {formatLocalizedNumber(item.records || 0)}</span>
                        <span>
                          {locale === "bn" ? "উৎস" : "Source"}: {item.sources?.[0] || "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/70 p-3 text-xs leading-6 text-[#111827] dark:bg-surface-2/50 dark:text-[#f1f5f2]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#111827] dark:text-[#f1f5f2]" />
                    <span>
                      {locale === "bn"
                        ? "একই ফসলের দাম স্থান ও বাজারভেদে ভিন্ন হতে পারে। প্রদর্শিত মূল্যকে সম্ভাব্য বাজারদরের ধারণা হিসেবে নিন এবং বিক্রির আগে স্থানীয় বাজারে যাচাই করুন।"
                        : "Prices for the same crop can vary by location and market. Treat the displayed price as an indication of a possible market rate and verify it locally before selling."}
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
                            {locale === "bn" ? "প্রদর্শনী নমুনা · সচিত্র নমুনা ফরম্যাট (প্রদর্শনীমূলক)" : "Sample Demonstration (Illustrative) · DEMO · SAMPLE DATA"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">
                          {locale === "bn" ? "নমুনা ফরম্যাট · বাস্তব দর নয়" : "Sample format · Not a live quote"}
                        </p>
                        <div className="mt-3 flex items-baseline justify-between border-t border-line/60 pt-2.5">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "খুচরা নমুনা" : "Sample Retail"}</span>
                            <span className="text-lg font-extrabold text-[#123D2A] dark:text-emerald-300">{item.retail}<small className="text-xs font-normal">/{locale === "bn" ? "কেজি" : "kg"}</small></span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-muted block">{locale === "bn" ? "পাইকারি নমুনা" : "Sample Wholesale"}</span>
                            <span className="text-sm font-semibold text-content">{item.wholesale}<small className="text-xs font-normal">/{locale === "bn" ? "কেজি" : "kg"}</small></span>
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
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md kb-reveal">
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
                        : locale === "bn" ? "পূর্বাভাস পাওয়া যায়নি" : "Forecast unavailable"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {shortWindowSummary?.dateRange
                      ? (locale === "bn" ? `উৎস: Open-Meteo (${shortWindowSummary.dateRange})` : `Source: Open-Meteo (${shortWindowSummary.dateRange})`)
                      : (locale === "bn" ? "উৎস: Open-Meteo আবহাওয়া মডেল" : "Source: Open-Meteo weather model")}
                  </p>
                  <Image src="/img/photos/data-rainfall-temperature.avif" alt={locale === "bn" ? "থার্মোমিটারে তাপমাত্রা ও রৌদ্রোজ্জ্বল আবহাওয়া" : "Thermometer showing temperature in bright weather"} width={640} height={360} className="mt-3 h-20 w-full rounded-xl object-cover object-[75%_center]" />
                </div>

                {/* Rain Outlook Card */}
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                  <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 text-xs font-bold">
                    <CloudRain className="h-4 w-4" />
                    <span>{locale === "bn" ? "৭ দিনে মোট বৃষ্টিপাতের সম্ভাবনা" : "7-Day Rain Outlook"}</span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-content">
                    {shortWindowSummary?.rainTotal != null
                      ? `${formatLocalizedNumber(Math.round(shortWindowSummary.rainTotal))} mm`
                      : forecastStatus === "loading"
                        ? "..."
                        : locale === "bn" ? "পূর্বাভাস পাওয়া যায়নি" : "Forecast unavailable"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {shortWindowSummary?.rainTotal != null
                      ? (locale === "bn"
                          ? `৭ দিনে মোট বৃষ্টি · ${formatLocalizedNumber(shortWindowSummary.rainDays)} দিন বৃষ্টি প্রত্যাশিত`
                          : `7-day total rain · ${shortWindowSummary.rainDays} rain day(s) expected`)
                      : (locale === "bn" ? "উৎস: Open-Meteo বৃষ্টিপাত পূর্বাভাস" : "Source: Open-Meteo rainfall model")}
                  </p>
                  <Image src="/img/photos/data-rainfall-observations.jpg" alt={locale === "bn" ? "কৃষিজমিতে বৃষ্টির পানি পড়ছে" : "Rain falling over agricultural land"} width={640} height={360} className="mt-3 h-20 w-full rounded-xl object-cover" />
                </div>

                {/* Soil Moisture Card */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold">
                    <Droplets className="h-4 w-4" />
                    <span>{locale === "bn" ? "মাটির আর্দ্রতা (SMAP উপগ্রহ)" : "Soil Moisture (NASA SMAP L3)"}</span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-content">
                    {currentSoilMoisture?.soilMoisture != null
                      ? `${formatLocalizedNumber(currentSoilMoisture.soilMoisture)} ${currentSoilMoisture.unit || "m³/m³"}`
                      : soilMoistureStatus === "loading"
                        ? "…"
                        : locale === "bn" ? "তথ্য পাওয়া যায়নি" : "Data unavailable"}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {currentSoilMoisture?.soilMoisture != null
                      ? (locale === "bn"
                          ? `তারিখ: ${currentSoilMoisture.dateLabel || "তারিখ নেই"} · ০-৫ সেমি উপরিপৃষ্ঠের আঞ্চলিক প্রক্সি`
                          : `Date: ${currentSoilMoisture.dateLabel || "Unavailable"} · 0–5 cm surface regional proxy`)
                      : (locale === "bn"
                          ? soilMoistureStatus === "loading" ? "স্যাটেলাইট তথ্য লোড হচ্ছে" : "এই এলাকার জন্য SMAP পর্যবেক্ষণ অনুপলব্ধ"
                          : soilMoistureStatus === "loading" ? "Loading satellite observation" : "No SMAP observation is available for this area")}
                  </p>
                  <Image src="/img/photos/soil-moisture-card.jpg" alt={locale === "bn" ? "হাতে মাটি ধরে রাখা" : "Hands holding soil"} width={640} height={360} className="mt-3 h-20 w-full rounded-xl object-cover" />
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
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md kb-reveal">
              <div className="kb-preview-tab-banner" aria-hidden="true">
                <Image src="/img/photos/crop-planning-banner.png" alt="" width={1000} height={668} />
              </div>
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
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-km-md kb-reveal">
              <div className="kb-preview-tab-banner" aria-hidden="true">
                <Image src="/img/photos/ai-assistant.avif" alt="" width={1200} height={627} />
              </div>
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
                      ? "এটি এআই সহকারীর ইন্টারফেস প্রদর্শনের জন্য একটি সাধারণ নমুনা প্রশ্নোত্তর। এটি আপনার মাঠের ব্যক্তিগত সুপারিশ বা অনুমোদন নয়।"
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
                  <article key={dataset.key} className={`relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none ${dataset.tone}`}>
                    <div className="kb-dataset-visual">
                      <Image src={dataset.image} alt="" fill sizes="(max-width: 1024px) 100vw, 25vw" className="object-cover" />
                    </div>
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
            <div className="mt-6 flex justify-center">
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

        {/* About follows the data and workflow sections. */}
        <section id="about" aria-labelledby="about-title" className="scroll-mt-20 border-t border-line bg-surface px-4 py-14 dark:bg-bg sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="about-title" className="text-3xl font-bold tracking-tight text-forest dark:text-green-200 sm:text-4xl">{t("landing.sectionAbout")}</h2>
              <p className="mt-3 text-base leading-relaxed text-muted">{t("landing.aboutSimple.subtitle")}</p>
            </div>
            <div className="relative isolate mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-green-300 bg-[#edf4e5] p-6 pb-24 shadow-md dark:border-green-800 dark:bg-[#203524] sm:p-9 sm:pb-24">
              <Image src="/img/photos/about-farm-background.avif" alt="" fill sizes="(max-width: 1024px) 100vw, 960px" className="absolute inset-0 z-0 h-full w-full object-cover" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#f7f7ed]/95 via-[#f7f7ed]/88 to-[#f7f7ed]/58 dark:from-[#17251d]/92 dark:via-[#17251d]/84 dark:to-[#17251d]/62" />
              <div className="relative z-10 max-w-3xl">
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
              <Leaf className="pointer-events-none absolute right-4 top-12 z-[2] h-44 w-44 -rotate-12 text-green-600 opacity-[0.08] dark:text-green-200" strokeWidth={1} aria-hidden="true" />
              <svg aria-hidden="true" focusable="false" viewBox="0 0 1000 90" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-20 w-full opacity-65 dark:opacity-25">
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
