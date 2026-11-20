"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Calculator, ExternalLink, Info, LoaderCircle, MapPin, Plus, Store, Trash2, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { compareMarketMargins, createMarketPriceAlert, deleteMarketPriceAlert, fetchMarketDataStatus, fetchMarketPriceAlerts, fetchMarketPriceForecast, fetchMarketReferenceCatalog, fetchMarketReferenceSeries, fetchMarketSourceCatalog, recordMarketQuote } from "@/services/api.js";

const REPORT_BASE_URL = "https://market.dam.gov.bd/market_daily_price_report/";
const MARKET_DIRECTORY_URL = "https://market.dam.gov.bd/manage_market_directory";
const CLASSIFIED_URL = "https://market.dam.gov.bd/classified_home";
const SELL_POST_URL = "https://market.dam.gov.bd/create_classified_post";
const bangladeshToday = () => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function MarketPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { locale } = useLang();
  const bn = locale === "bn";
  const reportUrl = `${REPORT_BASE_URL}?L=${bn ? "B" : "E"}`;
  const c = bn ? {
    title: "আজকের বাজার দেখুন। নিজের হিসাব বুঝুন।", intro: "কৃষি বিপণন অধিদপ্তরের সরকারি বাজার রিপোর্ট দেখুন, নিজের লক্ষ্যদর অনুসরণ করুন, আর ফসল থেকে কত আয় দরকার তা হিসাব করুন।",
    report: "সরকারি দৈনিক বাজারদর", department: "কৃষি বিপণন অধিদপ্তর (DAM), বাংলাদেশ", openReport: "DAM রিপোর্ট খুলুন", reportHint: "দাম ও এলাকার তথ্য DAM-এর রিপোর্ট অনুযায়ী। এখানে না খুললে মূল সাইটে দেখুন।",
    calculator: "আপনার খরচের হিসাব", calculatorText: "নিজের খরচ ও সম্ভাব্য ফলন থেকে ন্যূনতম দর হিসাব করুন। এটি পরিকল্পনার সহায়তা, নিশ্চিত বিক্রয়মূল্য বা লাভের পূর্বাভাস নয়।", cost: "মোট চাষ ও বিক্রির খরচ (৳)", harvest: "সম্ভাব্য ফলন (কেজি)", margin: "অতিরিক্ত লাভের হার (%)", breakEven: "খরচ ওঠার দর", targetMargin: "লাভসহ লক্ষ্যদর",
    alerts: "আমার বাজারদর অ্যালার্ট", alertsText: "লক্ষ্যদর ঠিক করুন, তারপর DAM রিপোর্টের দর লিখে মিলিয়ে দেখুন। DAM-এর দাম অ্যাপ নিজে পড়ে না; আপনার দেওয়া দর লক্ষ্য ছুঁলেই, Settings-এ SMS চালু থাকলে মেসেজ যাবে।",
    login: "অ্যালার্ট সংরক্ষণ ও লক্ষ্যদরের বার্তা পেতে সাইন ইন করুন।", signIn: "সাইন ইন", crop: "ফসল / পণ্য", cropEg: "যেমন: সরিষা", market: "বাজার (ঐচ্ছিক)", marketEg: "যেমন: কুমিল্লা সদর", price: "লক্ষ্যদর (৳)", unit: "একক", perKg: "প্রতি কেজি", perMaund: "প্রতি মণ", save: "লক্ষ্য সংরক্ষণ", loading: "অ্যালার্ট লোড হচ্ছে…", noAlerts: "এখনো কোনো লক্ষ্যদর নেই। ফসল ও লক্ষ্যদর যোগ করে শুরু করুন।", at: "লক্ষ্যদর", latest: "সর্বশেষ দেওয়া দর", noQuote: "এখনো দর দেওয়া হয়নি", targetHit: "লক্ষ্য ছুঁয়েছে", quote: "সর্বশেষ DAM দর", reportDate: "রিপোর্টের তারিখ", check: "দর মিলিয়ে দেখুন", reached: "লক্ষ্য পূরণ হয়েছে", below: "দর সংরক্ষিত হয়েছে। এখনো লক্ষ্যদর ছোঁয়নি।", saved: "লক্ষ্যদর সংরক্ষিত। মিলিয়ে দেখতে নিচে DAM রিপোর্টের সর্বশেষ দর লিখুন।", remove: "অ্যালার্ট মুছুন",
    findMarket: "বাজার খুঁজুন", directoryText: "DAM-এর বাজার ডিরেক্টরি ও সাম্প্রতিক পণ্যমূল্য দেখুন। বাজারের সময়, কার্যক্রম ও যোগাযোগ সরাসরি DAM-এর কাছে যাচাই করুন।", directory: "DAM বাজার ডিরেক্টরি খুলুন", buyers: "ক্রেতা খুঁজুন বা পণ্য বিক্রির পোস্ট দিন", buyersText: "ক্রেতা ও বিক্রেতার বিজ্ঞাপনের জন্য DAM-এর classified ও free-post পেজ ব্যবহার করুন। লেনদেনের আগে বিজ্ঞাপন ও শর্ত যাচাই করুন।", browse: "বিজ্ঞাপন দেখুন", post: "পণ্য বিক্রির পোস্ট দিন", caution: "ফসল, মান, একক, বাজার, পাইকারি/খুচরা দর ও রিপোর্টের তারিখ মিলিয়ে দেখুন। পরিবহন, সংরক্ষণ ও ক্রেতার শর্তে হাতে পাওয়া দাম বদলাতে পারে। বিক্রির আগে তথ্য সরাসরি যাচাই করুন।",
  } : {
    title: "Check today’s market. Know your own numbers.", intro: "Check official Department of Agricultural Marketing reports, follow your own target prices, and plan what you need to earn from the harvest.",
    report: "Official daily market report", department: "Department of Agricultural Marketing (DAM), Bangladesh", openReport: "Open DAM report", reportHint: "Prices and locations depend on DAM’s report. If it does not load here, open the source directly.",
    calculator: "Your break-even price", calculatorText: "Estimate the minimum price from your own costs and expected harvest. This is a planning aid, not a guaranteed offer or profit forecast.", cost: "Total growing and selling cost (৳)", harvest: "Expected harvest (kg)", margin: "Extra margin (%)", breakEven: "Break-even", targetMargin: "Target with margin",
    alerts: "My price alerts", alertsText: "Set a price target, then enter a quote from the DAM report to check it. The app does not auto-read DAM prices; SMS fires only when your entered quote reaches the target and SMS alerts are enabled in Settings.",
    login: "Sign in to save alerts and receive target notifications.", signIn: "Sign in", crop: "Crop / product", cropEg: "e.g. mustard seed", market: "Market (optional)", marketEg: "e.g. Cumilla Sadar", price: "Target (৳)", unit: "Unit", perKg: "Per kg", perMaund: "Per maund", save: "Save target", loading: "Loading alerts…", noAlerts: "No price targets yet. Add a crop and price above to start tracking.", at: "Alert at", latest: "Latest entered quote", noQuote: "No quote entered yet", targetHit: "Target reached", quote: "Latest DAM quote", reportDate: "Report date", check: "Check price", reached: "Your target price was reached", below: "Quote saved. Your target has not been reached yet.", saved: "Price target saved. Enter the latest DAM quote below to check it.", remove: "Delete alert",
    findMarket: "Find a market", directoryText: "Look up DAM market directory details and recent official commodity prices. Confirm hours, market availability and contacts directly with DAM.", directory: "Open DAM market directory", buyers: "Find buyers or post produce", buyersText: "DAM’s classified and free-post pages are the official public route for buyer and seller listings. Check each listing and terms before making a deal.", browse: "Browse classified ads", post: "Post produce", caution: "Check the crop, grade, unit, market, wholesale or retail price type, and report date. Transport, storage, quality and buyer terms can change what you receive. Market listings and prices are informational; verify directly before a sale.",
  };
  const priceTypeLabels = bn
    ? { producer: "উৎপাদক", wholesale: "পাইকারি", retail: "খুচরা" }
    : { producer: "Producer", wholesale: "Wholesale", retail: "Retail" };
  const priceTypeLabel = (value) => priceTypeLabels[value] || (bn ? "আগের অ্যালার্ট · ধরন উল্লেখ নেই" : "Previous alert · type not recorded");
  const staleQuoteMessage = bn
    ? "এই রিপোর্টের তারিখ আপনার আগের সংরক্ষিত দরের চেয়ে পুরোনো।"
    : "This report date is older than your latest saved quote.";
  const smsDeliveryMessage = bn
    ? { sent: "SMS পাঠানো হয়েছে।", failed: "SMS পাঠানো যায়নি—Settings ও নম্বর যাচাই করুন।", off: "SMS পেতে Settings-এ যাচাইকৃত নম্বর দিয়ে অ্যালার্ট চালু করুন।" }
    : { sent: "SMS sent.", failed: "SMS could not be sent. Check your verified number and Settings.", off: "To receive SMS, enable alerts in Settings with a verified phone number." };
  const formatPrice = (value) => new Intl.NumberFormat(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const [cost, setCost] = useState(0);
  const [costItems, setCostItems] = useState({
    seeds: 0,
    fertilizer: 0,
    irrigation: 0,
    labor: 0,
    transport: 0,
    other: 0,
  });
  const [showItemized, setShowItemized] = useState(false);
  const [transportMarket, setTransportMarket] = useState("");
  const [transportDistanceKm, setTransportDistanceKm] = useState("");
  const [produceKg, setProduceKg] = useState("");
  const [transportQuote, setTransportQuote] = useState("");

  const updateCostItem = (key, val) => {
    const numeric = Math.max(0, Number(val) || 0);
    const updated = { ...costItems, [key]: numeric };
    setCostItems(updated);
    const total = Object.values(updated).reduce((sum, v) => sum + v, 0);
    setCost(total);
  };
  const [yieldKg, setYieldKg] = useState(0);
  const [margin, setMargin] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [alertsOwnerId, setAlertsOwnerId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commodity, setCommodity] = useState("");
  const [market, setMarket] = useState("");
  const [priceType, setPriceType] = useState("retail");
  const [unit, setUnit] = useState("kg");
  const [targetPrice, setTargetPrice] = useState("");
  const [quotes, setQuotes] = useState({});
  const [forecastCrop, setForecastCrop] = useState("");
  const [forecastDivision, setForecastDivision] = useState("");
  const [forecastType, setForecastType] = useState("wholesale");
  const [forecastFrequency, setForecastFrequency] = useState("daily");
  const [forecastHorizon, setForecastHorizon] = useState("7");
  const [forecastResult, setForecastResult] = useState(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);
  const [referenceCatalog, setReferenceCatalog] = useState(null);
  const [sourceCatalog, setSourceCatalog] = useState(null);
  const [sourceCatalogError, setSourceCatalogError] = useState("");
  const [marketDataStatus, setMarketDataStatus] = useState(null);
  const [referenceCrop, setReferenceCrop] = useState("rice-coarse");
  const [referenceDivision, setReferenceDivision] = useState("National");
  const [referenceCatalogError, setReferenceCatalogError] = useState("");
  const [referenceLoad, setReferenceLoad] = useState(null);
  const referenceKey = `${referenceCrop}:${referenceDivision}`;
  const currentReferenceLoad = referenceLoad?.key === referenceKey ? referenceLoad : null;
  const referenceSeries = currentReferenceLoad?.data || null;
  const referenceError = referenceCatalogError || currentReferenceLoad?.error || "";
  const referenceLoading = !referenceCatalogError && (!referenceCatalog || !currentReferenceLoad);
  const [marginCrops, setMarginCrops] = useState([]);
  const [marginResults, setMarginResults] = useState(null);
  const [marginError, setMarginError] = useState("");
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginPriceType, setMarginPriceType] = useState("wholesale");
  const currentUserId = user?._id || user?.id || null;
  const loadingAlerts = Boolean(user && alertsOwnerId !== currentUserId);
  const breakEven = useMemo(() => Number(cost) > 0 && yieldKg > 0 ? Number(cost) / yieldKg : null, [cost, yieldKg]);
  const target = breakEven == null ? null : breakEven * (1 + margin / 100);
  const transportTotal = Number(transportQuote) > 0 ? Number(transportQuote) : null;
  const transportCostPerKg = transportTotal != null && Number(produceKg) > 0 ? transportTotal / Number(produceKg) : null;

  const referenceChart = useMemo(() => {
    const observations = referenceSeries?.observations?.slice(-36) || [];
    if (observations.length < 2) return null;
    const points = observations.map((point) => Number(point.price)).filter(Number.isFinite);
    if (referenceSeries.forecast?.price) points.push(Number(referenceSeries.forecast.price));
    const min = Math.min(...points);
    const max = Math.max(...points);
    const spread = Math.max(max - min, 1);
    const chartWidth = 720;
    const chartHeight = 210;
    const marginX = 14;
    const marginY = 18;
    const xAt = (index, count) => marginX + (chartWidth - marginX * 2) * index / Math.max(count - 1, 1);
    const yAt = (value) => chartHeight - marginY - (Number(value) - min) / spread * (chartHeight - marginY * 2);
    const historyPath = observations.map((point, index) => `${index ? "L" : "M"}${xAt(index, observations.length).toFixed(1)},${yAt(point.price).toFixed(1)}`).join(" ");
    const forecastPath = referenceSeries.forecast
      ? `M${xAt(observations.length - 1, observations.length).toFixed(1)},${yAt(observations.at(-1).price).toFixed(1)} L${(chartWidth - marginX).toFixed(1)},${yAt(referenceSeries.forecast.price).toFixed(1)}`
      : "";
    return { observations, historyPath, forecastPath, chartWidth, chartHeight, min, max };
  }, [referenceSeries]);

  const handleForecast = async (event) => {
    event.preventDefault(); setForecastLoading(true); setForecastError(""); setForecastResult(null);
    if (!forecastCrop) {
      setForecastError(sourceCatalogError || (bn ? "যাচাইকৃত ফসলের তালিকা পাওয়া যায়নি। পরে আবার চেষ্টা করুন।" : "The verified crop catalog is unavailable. Please try again later."));
      setForecastLoading(false);
      return;
    }
    try {
      const result = await fetchMarketPriceForecast({ commodity: forecastCrop, division: forecastDivision, priceType: forecastType, frequency: forecastFrequency, horizonDays: forecastFrequency === "weekly" ? 28 : Number(forecastHorizon) });
      if (result.success) setForecastResult(result.data);
      else setForecastError(result.error?.code === "MARKET_HISTORY_UNAVAILABLE"
        ? (bn ? "এই ফসলের যাচাইকৃত ইতিহাস এখনো যোগ হয়নি। DAM-এর ৫ বছরের তথ্য যোগ হলে পূর্বাভাস দেখা যাবে।" : "Verified price history for this crop is not loaded yet. Forecasts will appear after the DAM historical data is imported.")
        : result.error?.message || (bn ? "দরের পূর্বাভাস আনা যায়নি।" : "Could not load a price outlook."));
    } catch { setForecastError(bn ? "দরের পূর্বাভাস আনতে সংযোগ পাওয়া যায়নি।" : "Could not connect to load a price outlook."); }
    setForecastLoading(false);
  };

  useEffect(() => {
    let active = true;
    void fetchMarketSourceCatalog().then((result) => {
      if (!active) return;
      if (result.success) {
        setSourceCatalog(result.data);
        setSourceCatalogError("");
        const crops = result.data?.crops || [];
        setForecastCrop((current) => crops.some((item) => item.commodity.toLocaleLowerCase("en") === current) ? current : (crops[0]?.commodity.toLocaleLowerCase("en") || ""));
      } else {
        setSourceCatalogError(result.error?.message || (bn ? "যাচাইকৃত ফসলের তালিকা পাওয়া যায়নি।" : "Could not load the verified crop catalog."));
      }
    }).catch(() => { if (active) setSourceCatalogError(bn ? "ফসলের তালিকার সাথে সংযোগ হয়নি।" : "Could not connect to the crop catalog."); });
    return () => { active = false; };
  }, [bn]);

  useEffect(() => {
    let active = true;
    void fetchMarketDataStatus().then((result) => { if (active && result.success) setMarketDataStatus(result.data); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMarketReferenceCatalog().then((result) => {
      if (!active) return;
      if (result.success) {
        setReferenceCatalog(result.data);
        if (result.data?.crops?.length) setReferenceCrop((current) => result.data.crops.some((crop) => crop.cropId === current) ? current : result.data.crops[0].cropId);
        if (result.data?.divisions?.length) setReferenceDivision((current) => result.data.divisions.includes(current) ? current : result.data.divisions[0]);
      } else setReferenceCatalogError(result.error?.message || (bn ? "মাসিক রেফারেন্স ডেটা পাওয়া যায়নি।" : "Monthly reference data is not available."));
    }).catch(() => { if (active) setReferenceCatalogError(bn ? "মাসিক রেফারেন্স ডেটার সাথে সংযোগ হয়নি।" : "Could not reach monthly reference data."); });
    return () => { active = false; };
  }, [bn]);

  useEffect(() => {
    if (!referenceCatalog || !referenceCrop || !referenceDivision) return undefined;
    let active = true;
    const key = `${referenceCrop}:${referenceDivision}`;
    void fetchMarketReferenceSeries({ cropId: referenceCrop, division: referenceDivision }).then((result) => {
      if (!active) return;
      if (result.success) setReferenceLoad({ key, data: result.data, error: "" });
      else setReferenceLoad({ key, data: null, error: result.error?.message || (bn ? "এই ফসলের মাসিক ইতিহাস পাওয়া যায়নি।" : "Monthly history is unavailable for this crop.") });
    }).catch(() => { if (active) setReferenceLoad({ key, data: null, error: bn ? "মাসিক ইতিহাস আনতে সংযোগ পাওয়া যায়নি।" : "Could not connect to load monthly history." }); });
    return () => { active = false; };
  }, [referenceCatalog, referenceCrop, referenceDivision, bn]);

  const handleMarginComparison = async (event) => {
    event.preventDefault(); setMarginLoading(true); setMarginError(""); setMarginResults(null);
    if (marginCrops.length < 2 || marginCrops.some((item) => !item.commodity || Number(item.totalCostBdt) < 0 || Number(item.expectedYieldKg) <= 0)) {
      setMarginError(bn ? "তুলনার জন্য অন্তত দুইটি ফসল বেছে নিয়ে নিজের খরচ ও ফলন লিখুন।" : "Choose at least two crops and enter your own cost and expected yield for each.");
      setMarginLoading(false);
      return;
    }
    try {
      const result = await compareMarketMargins({ crops: marginCrops.map((item) => ({ ...item, totalCostBdt: Number(item.totalCostBdt), expectedYieldKg: Number(item.expectedYieldKg) })), division: forecastDivision, priceType: marginPriceType, horizonDays: 30 });
      if (result.success) setMarginResults(result.data);
      else setMarginError(result.error?.message || (bn ? "লাভের তুলনা করা যায়নি।" : "Could not compare estimated margins."));
    } catch { setMarginError(bn ? "লাভের তুলনা করতে সংযোগ পাওয়া যায়নি।" : "Could not connect to compare estimated margins."); }
    setMarginLoading(false);
  };

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    void fetchMarketPriceAlerts().then((result) => {
      if (!active) return;
      if (result.success) setAlerts(result.data?.alerts || []);
      else setError(result.error?.message || "Could not load your price alerts.");
    }).catch(() => { if (active) setError(bn ? "দরের অ্যালার্ট আনা যায়নি।" : "Could not load your price alerts."); }).finally(() => { if (active) setAlertsOwnerId(currentUserId); });
    return () => { active = false; };
  }, [user, currentUserId, bn]);

  const handleCreateAlert = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const result = await createMarketPriceAlert({ commodity, market, priceType, unit, targetPrice: Number(targetPrice) });
    if (!result.success) setError(result.error?.message || "Could not create this alert.");
    else { setAlerts((current) => [result.data.alert, ...current]); setCommodity(""); setMarket(""); setTargetPrice(""); setNotice(c.saved); }
    setSaving(false);
  };

  const handleQuote = async (event, alertItem) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const quote = quotes[alertItem._id] || {};
    const result = await recordMarketQuote(alertItem._id, { observedPrice: Number(quote.price), observedOn: quote.date || bangladeshToday() });
    if (!result.success) setError(result.error?.code === "STALE_MARKET_QUOTE" ? staleQuoteMessage : result.error?.message || "Could not save the quote.");
    else {
      setAlerts((current) => current.map((item) => item._id === alertItem._id ? result.data.alert : item));
      const hitMessage = result.data.crossed ? `${alertItem.commodity}: ${c.reached} — ৳${formatPrice(alertItem.targetPrice)}/${alertItem.unit}.` : c.below;
      const smsMessage = result.data.crossed ? ` ${smsDeliveryMessage[result.data.smsDelivery] || smsDeliveryMessage.off}` : "";
      setNotice(`${hitMessage}${smsMessage}`);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setSaving(true); setError("");
    const result = await deleteMarketPriceAlert(id);
    if (result.success) setAlerts((current) => current.filter((item) => item._id !== id));
    else setError(result.error?.message || "Could not remove this alert.");
    setSaving(false);
  };

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
    <header className="mb-8 rounded-3xl bg-[#eee7d8] p-6 text-[#173B2A] sm:p-10">
      <div className="flex items-center gap-2 text-sm font-bold text-[#9a6226]"><Store size={18}/> KrishiBondhu · Market</div>
      <h1 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{c.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[#526761]">{c.intro}</p>
      {user?.role === "admin" ? <Link href="/market-import" className="mt-5 inline-flex rounded-full border border-[#0d6865] px-4 py-2 text-sm font-bold text-[#247A4B]">{bn ? "সরকারি বাজারদর আমদানি" : "Admin: import official prices"}</Link> : null}
      <div className="mt-5 rounded-2xl border border-[#d9d0ba] bg-white/70 p-4 text-sm text-[#526761]" role="status">
        <p className="font-bold text-[#173B2A]">{bn ? "বাজার ডেটার সর্বশেষ অবস্থা" : "Market data freshness"}</p>
        <p className="mt-1">{bn ? "সর্বশেষ সফল আমদানি" : "Last successful import"}: {marketDataStatus?.lastSuccessfulSyncAt ? new Date(marketDataStatus.lastSuccessfulSyncAt).toLocaleString(bn ? "bn-BD" : "en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) : (bn ? "এখনো কোনো যাচাইকৃত DAM আমদানি নেই" : "No verified DAM import yet")}</p>
        <p className="mt-1">{bn ? "সর্বশেষ দামের রিপোর্ট তারিখ" : "Latest observed price date"}: {marketDataStatus?.latestVerifiedDailyObservation?.observedOn ? new Date(marketDataStatus.latestVerifiedDailyObservation.observedOn).toLocaleDateString(bn ? "bn-BD" : "en-BD", { timeZone: "Asia/Dhaka" }) : "—"}{marketDataStatus?.latestVerifiedDailyObservation?.stale ? (bn ? " · পুরোনো তথ্য; বর্তমান দাম নয়" : " · Stale; not a current quote") : ""}</p>
        <p className="mt-1 text-xs">{bn ? "DAM-এর অনুমোদিত স্বয়ংক্রিয় API পাওয়া যায়নি। অ্যাডমিন সরকারি রিপোর্ট যাচাই করে আমদানি করেন।" : "No authorized DAM live API is documented. An administrator must verify and import official reports."}</p>
      </div>
    </header>

    <section className="mb-8 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
      <article className="overflow-hidden rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e0d0] p-5"><div><h2 className="text-xl font-bold text-[#173B2A]">{c.report}</h2><p className="mt-1 text-sm text-[#62736A]">{c.department}</p></div><a className="inline-flex items-center gap-2 rounded-full bg-[#247A4B] px-4 py-2.5 text-sm font-bold text-white" href={reportUrl} target="_blank" rel="noreferrer">{c.openReport} <ExternalLink size={15}/></a></div>
        <iframe title={c.report} src={reportUrl} loading="lazy" referrerPolicy="no-referrer" className="h-[620px] w-full bg-white" />
        <p className="px-5 py-3 text-xs text-[#62736A]">{c.reportHint}</p>
      </article>
      <article className="h-fit rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#247A4B]"><Calculator size={20}/><h2 className="text-xl font-bold text-[#173B2A]">{c.calculator}</h2></div>
          <button type="button" onClick={()=>setShowItemized(!showItemized)} className="rounded-full border border-[#0d6865] px-3 py-1 text-xs font-bold text-[#247A4B] hover:bg-[#E8F2E9]">
            {showItemized ? (bn ? "সংক্ষিপ্ত ফর্ম" : "Simple view") : (bn ? "খাতভিত্তিক হিসাব" : "Itemized breakdown")}
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#62736A]">{c.calculatorText}</p>
        
        {showItemized ? (
          <div className="mt-4 space-y-2.5 rounded-xl border border-[#e6decc] bg-[#f0eadb] p-3 text-xs">
            <p className="font-bold text-[#173B2A]">{bn ? "উৎপাদন খরচের খাতভিত্তিক হিসাব (ডকুমেন্ট ৪.৫.সি)" : "Production Cost Items (Doc 4.5.C)"}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="font-semibold text-[#526761]">{bn ? "বীজ বাবদ (৳)" : "Seeds (৳)"}
                <input type="number" min="0" value={costItems.seeds} onChange={e=>updateCostItem("seeds", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
              <label className="font-semibold text-[#526761]">{bn ? "সার ও কীটনাশক (৳)" : "Fertilizers (৳)"}
                <input type="number" min="0" value={costItems.fertilizer} onChange={e=>updateCostItem("fertilizer", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
              <label className="font-semibold text-[#526761]">{bn ? "সেচ খরচ (৳)" : "Irrigation (৳)"}
                <input type="number" min="0" value={costItems.irrigation} onChange={e=>updateCostItem("irrigation", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
              <label className="font-semibold text-[#526761]">{bn ? "শ্রমিক মজুরি (৳)" : "Labor (৳)"}
                <input type="number" min="0" value={costItems.labor} onChange={e=>updateCostItem("labor", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
              <label className="font-semibold text-[#526761]">{bn ? "পরিবহন খরচ (৳)" : "Transportation (৳)"}
                <input type="number" min="0" value={costItems.transport} onChange={e=>updateCostItem("transport", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
              <label className="font-semibold text-[#526761]">{bn ? "অন্যান্য (৳)" : "Other (৳)"}
                <input type="number" min="0" value={costItems.other} onChange={e=>updateCostItem("other", e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-2 py-1.5 text-xs text-[#173B2A]"/>
              </label>
            </div>
            <p className="text-right font-bold text-[#247A4B]">{bn ? "সর্বমোট ব্যয়: ৳" : "Total Cost: ৳"}{formatPrice(cost)}</p>
          </div>
        ) : (
          <label className="mt-5 block text-sm font-semibold text-[#173B2A]">{c.cost}<input className="mt-1.5 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 py-2.5" type="number" min="0" value={cost || ""} onChange={e=>setCost(Math.max(0, Number(e.target.value)||0))}/></label>
        )}

        <label className="mt-4 block text-sm font-semibold text-[#173B2A]">{c.harvest}<input className="mt-1.5 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 py-2.5" type="number" min="0" step="0.01" value={yieldKg || ""} onChange={e=>setYieldKg(Math.max(0, Number(e.target.value)||0))}/></label>
        <label className="mt-4 block text-sm font-semibold text-[#173B2A]">{c.margin}<input className="mt-1.5 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 py-2.5" type="number" min="0" max="300" value={margin} onChange={e=>setMargin(Math.max(0, Math.min(300, Number(e.target.value)||0)))}/></label>
        
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#f0eadb] p-3.5">
            <span className="text-xs text-[#62736A]">{c.breakEven}</span>
            <strong className="mt-1 block text-lg text-[#173B2A]">{breakEven == null ? "—" : `৳${formatPrice(breakEven)}`}<small className="text-xs font-medium"> / {bn ? "কেজি" : "kg"}</small></strong>
            <span className="mt-1 block text-xs text-[#526761]">{breakEven == null ? "—" : `৳${formatPrice(breakEven * 40)}`} / {bn ? "মণ" : "maund"}</span>
          </div>
          <div className="rounded-xl bg-[#E8F2E9] p-3.5">
            <span className="text-xs text-[#526761]">{c.targetMargin}</span>
            <strong className="mt-1 block text-lg text-[#247A4B]">{target == null ? "—" : `৳${formatPrice(target)}`}<small className="text-xs font-medium"> / {bn ? "কেজি" : "kg"}</small></strong>
            <span className="mt-1 block text-xs text-[#0f6c49]">{target == null ? "—" : `৳${formatPrice(target * 40)}`} / {bn ? "মণ" : "maund"}</span>
          </div>
        </div>
      </article>
    </section>

    <section className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6">
      <div className="flex items-start gap-3"><TrendingUp className="mt-1 text-[#247A4B]"/><div><h2 className="text-xl font-bold text-[#173B2A]">{bn ? "বাজারদরের পূর্বাভাস" : "Market price outlook"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#62736A]">{bn ? "নির্বাচিত ফসল, এলাকার ধরন, দরের ধরন ও সময়কালের যাচাইকৃত ইতিহাস উপযুক্ত হলে তবেই পূর্বাভাস আসে। নিচের মাসিক রেফারেন্স আলাদা মডেলভিত্তিক তথ্য; কোনোটিই আজকের DAM দর বা নিশ্চিত বিক্রয়মূল্য নয়।" : "Forecasts appear only when verified history supports the selected crop, area, price type, and frequency. The monthly reference below is a separate modeled series. Neither is a live DAM quote or a guaranteed selling price."}</p></div></div>
      <form onSubmit={handleForecast} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-[#526761]">{bn ? "ফসল / পণ্য" : "Crop / commodity"}<select value={forecastCrop} onChange={e=>setForecastCrop(e.target.value)} disabled={!sourceCatalog?.crops?.length} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]">{!sourceCatalog?.crops?.length ? <option value="">{sourceCatalogError ? (bn ? "যাচাইকৃত তালিকা পাওয়া যায়নি" : "Verified catalog unavailable") : sourceCatalog ? (bn ? "যাচাইকৃত ফসলের তথ্য নেই" : "No verified crops available") : (bn ? "ফসলের তালিকা লোড হচ্ছে…" : "Loading crop catalog…")}</option> : sourceCatalog.crops.map((item) => <option key={item.commodity} value={item.commodity.toLocaleLowerCase("en")}>{item.commodity}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#526761]">{bn ? "বিভাগ / ডেটা এলাকা" : "Division / dataset area"}<select value={forecastDivision} onChange={e=>setForecastDivision(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="">{bn ? "DAM-এর সব বিভাগ" : "All DAM divisions"}</option><option value="National">{bn ? "জাতীয় গবেষণা ডেটাসেট" : "National research dataset"}</option>{["Dhaka","Chattogram","Khulna","Rajshahi","Barishal","Rangpur","Sylhet","Mymensingh"].map(item=><option value={item} key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#526761]">{bn ? "দরের ধরন" : "Price type"}<select value={forecastType} onChange={e=>setForecastType(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="wholesale">{bn ? "পাইকারি" : "Wholesale"}</option><option value="producer">{bn ? "উৎপাদক" : "Grower / producer"}</option><option value="retail">{bn ? "খুচরা" : "Retail"}</option></select></label>
        <label className="text-xs font-semibold text-[#526761]">{bn ? "ডেটার সময়কাল" : "Data frequency"}<select value={forecastFrequency} onChange={e=>setForecastFrequency(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="daily">{bn ? "দৈনিক" : "Daily"}</option><option value="weekly">{bn ? "সাপ্তাহিক" : "Weekly"}</option></select></label>
        {forecastFrequency === "daily" ? <label className="text-xs font-semibold text-[#526761]">{bn ? "পূর্বাভাসের সময়" : "Forecast horizon"}<select value={forecastHorizon} onChange={e=>setForecastHorizon(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="7">{bn ? "৭ দিন" : "7 days"}</option><option value="30">{bn ? "৩০ দিন" : "30 days"}</option></select></label> : <div className="rounded-lg bg-[#f0eadb] px-3 py-2.5 text-xs text-[#66583c]">{bn ? "সাপ্তাহিক মডেল সর্বোচ্চ ৪ সপ্তাহ দেখায়।" : "Weekly model forecasts up to 4 weeks."}</div>}
        <button disabled={forecastLoading || !forecastCrop} className="mt-auto inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#247A4B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{forecastLoading ? <LoaderCircle size={16} className="animate-spin"/> : <TrendingUp size={16}/>} {bn ? "পূর্বাভাস দেখুন" : "View outlook"}</button>
      </form>
      {forecastError ? <p role="status" className="mt-4 rounded-xl bg-[#f0eadb] p-4 text-sm leading-6 text-[#66583c]">{forecastError}</p> : null}
      {forecastResult ? <div className="mt-5 grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-xl bg-[#E8F2E9] p-4"><p className="text-sm font-semibold text-[#526761]">{bn ? "সর্বশেষ যাচাইকৃত দর" : "Latest verified quote"}</p><strong className="mt-1 block text-2xl text-[#247A4B]">৳{formatPrice(forecastResult.data.latestObservedPrice)} <span className="text-sm font-medium">/ {forecastResult.meta.unit}</span></strong><p className="mt-1 text-xs text-[#526761]">{forecastResult.data.latestObservedOn} · {forecastResult.division} · {forecastResult.meta.priceType} · {forecastFrequency}</p><p className="mt-4 text-xs leading-5 text-[#526761]">{bn ? "ইতিহাস" : "History"}: {forecastResult.meta.historyStart} – {forecastResult.meta.historyEnd} ({forecastResult.meta.observationsUsed} {bn ? "টি রেকর্ড" : "records"})<br/>{bn ? "ব্যাকটেস্ট MAE" : "Backtest MAE"}: ৳{formatPrice(forecastResult.meta.backtest.selected.mae)} / {forecastResult.meta.unit}<br/>{bn ? "নির্বাচিত মডেল" : "Selected model"}: {forecastResult.meta.selectedModel} ({bn ? "Persistence MAE" : "persistence MAE"} ৳{formatPrice(forecastResult.meta.backtest.candidateMetrics.last_observation.mae)})</p><a className="mt-3 inline-block text-xs font-bold text-[#247A4B] underline" href={forecastResult.sourceUrl} target="_blank" rel="noreferrer">{forecastResult.meta.source} · {forecastResult.licence}</a></div><div className="overflow-x-auto rounded-xl border border-[#e6decc] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#f0eadb] text-[#526761]"><tr><th className="px-3 py-2">{bn ? "তারিখ" : "Date"}</th><th className="px-3 py-2">{bn ? "মাঝারি অনুমান" : "Estimate"}</th><th className="px-3 py-2">{bn ? "সম্ভাব্য পরিসর" : "Model range"}</th></tr></thead><tbody>{forecastResult.data.forecast.map(point=><tr key={point.date} className="border-t border-[#eee8dc]"><td className="px-3 py-2">{point.date}</td><td className="px-3 py-2 font-semibold text-[#247A4B]">৳{formatPrice(point.price)}</td><td className="px-3 py-2">৳{formatPrice(point.lower90)} – ৳{formatPrice(point.upper90)}</td></tr>)}</tbody></table><p className="px-3 py-2 text-xs leading-5 text-[#62736A]">{bn ? "পরিসরটি ব্যাকটেস্টের ভুলের ওপর ভিত্তি করে; আকস্মিক আবহাওয়া, নীতি বা সরবরাহ পরিবর্তন ধরা নাও পড়তে পারে।" : "Range is based on backtest error; sudden weather, policy or supply changes may not be captured."}</p></div></div> : null}
    </section>

    <section className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6">
      <div className="flex items-start gap-3"><Calculator className="mt-1 text-[#247A4B]"/><div><h2 className="text-xl font-bold text-[#173B2A]">{bn ? "ফসলভিত্তিক সম্ভাব্য লাভ তুলনা" : "Compare estimated crop margins"}</h2><p className="mt-1 text-sm leading-6 text-[#62736A]">{bn ? "প্রতি ফসলের নিজের মোট খরচ ও প্রত্যাশিত ফলন দিন। একই দরের ধরন ও জায়গার ৩০ দিনের বাজার-পূর্বাভাস দিয়ে সম্ভাব্য নিট আয় তুলনা হবে।" : "Enter your own total cost and expected harvest for each crop. The app compares estimated net returns using the same location and a 30-day forecast for one price type."}</p></div></div>
      <label className="mt-4 block max-w-sm text-xs font-semibold text-[#526761]">{bn ? "বিক্রির দর ধরন" : "Sale price basis"}<select value={marginPriceType} onChange={e=>setMarginPriceType(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="wholesale">{bn ? "পাইকারি" : "Wholesale"}</option><option value="producer">{bn ? "উৎপাদক / কৃষক দর" : "Grower / producer"}</option></select></label>
      <form onSubmit={handleMarginComparison} className="mt-4 space-y-3">
        {marginCrops.map((item, index) => <div key={index} className="grid gap-3 rounded-xl bg-[#f0eadb] p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
          <label className="text-xs font-semibold text-[#526761]">{bn ? "ফসল " + (index + 1) : "Crop " + (index + 1)}<select required value={item.commodity} onChange={e=>setMarginCrops(current=>current.map((crop,i)=>i===index?{...crop,commodity:e.target.value}:crop))} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="">{bn ? "ফসল বাছুন" : "Select a crop"}</option>{(sourceCatalog?.crops || []).map((crop) => <option key={crop.commodity.toLowerCase()} value={crop.commodity.toLowerCase()}>{crop.commodity}</option>)}</select></label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "মোট খরচ (৳)" : "Total cost (৳)"}<input required type="number" min="0" step="1" value={item.totalCostBdt} onChange={e=>setMarginCrops(current=>current.map((crop,i)=>i===index?{...crop,totalCostBdt:e.target.value}:crop))} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"/></label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "প্রত্যাশিত ফলন (কেজি)" : "Expected yield (kg)"}<input required type="number" min="1" step="1" value={item.expectedYieldKg} onChange={e=>setMarginCrops(current=>current.map((crop,i)=>i===index?{...crop,expectedYieldKg:e.target.value}:crop))} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"/></label>
          {marginCrops.length > 1 ? <button type="button" onClick={()=>setMarginCrops(current=>current.filter((_,i)=>i!==index))} className="mt-auto min-h-[40px] rounded-lg border border-[#d9d0ba] px-3 text-sm font-bold text-[#8b5045]">{bn ? "বাদ দিন" : "Remove"}</button> : null}
        </div>)}
        {marginCrops.length < 2 ? <p className="text-xs leading-5 text-[#62736A]">{bn ? "তুলনার আগে অন্তত দুইটি ফসল যোগ করে নিজের খরচ ও প্রত্যাশিত ফলন লিখুন।" : "Add at least two crops and enter your own costs and expected yields before comparing."}</p> : null}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={marginCrops.length >= 8 || !sourceCatalog?.crops?.length} onClick={()=>setMarginCrops(current=>[...current,{commodity:"",totalCostBdt:"",expectedYieldKg:""}])} className="min-h-[42px] rounded-lg border border-[#0d6865] px-4 text-sm font-bold text-[#247A4B] disabled:opacity-50">{bn ? "+ আরেকটি ফসল" : "+ Add crop"}</button><button disabled={marginLoading || marginCrops.length < 2 || marginCrops.some((item) => !item.commodity || !item.totalCostBdt || !item.expectedYieldKg)} className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#247A4B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{marginLoading ? <LoaderCircle size={16} className="animate-spin"/> : <Calculator size={16}/>} {bn ? "লাভ তুলনা করুন" : "Compare margins"}</button></div>
        {!sourceCatalog?.crops?.length ? <p role="status" className="text-xs leading-5 text-[#62736A]">{sourceCatalogError || (sourceCatalog ? (bn ? "যাচাইকৃত ডেটাসেটে ফসল নেই; ফসলভিত্তিক তুলনা আপাতত করা যাবে না।" : "No crops are available in the verified dataset; crop comparison is unavailable for now.") : (bn ? "যাচাইকৃত ফসলের তালিকা লোড হচ্ছে; তালিকা এলে ফসল যোগ করতে পারবেন।" : "Loading the verified crop catalog. You can add crops when it becomes available."))}</p> : null}
      </form>
      {marginError ? <p role="status" className="mt-4 rounded-xl bg-[#f0eadb] p-4 text-sm leading-6 text-[#66583c]">{marginError}</p> : null}
      {marginResults ? <div className="mt-4 space-y-3">{marginResults.ranked.map((item)=><article key={item.commodity} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6decc] bg-white p-4"><div><p className="font-bold text-[#173B2A]">#{item.rank} · {item.commodity}</p><p className="mt-1 text-xs text-[#62736A]">৳{formatPrice(item.averageForecastPrice)}/{item.unit} · {bn ? "উৎস ইতিহাস" : "Source history"}: {item.historyStart} – {item.historyEnd}</p></div><div className="text-right"><p className="text-xs text-[#62736A]">{bn ? "সম্ভাব্য নিট আয়" : "Estimated net return"}</p><strong className={`text-xl ${item.estimatedNetBdt >= 0 ? "text-[#247A4B]" : "text-[#8b4038]"}`}>৳{formatPrice(item.estimatedNetBdt)}</strong><p className="text-xs text-[#62736A]">{bn ? "মডেল পরিসর" : "Model range"}: ৳{formatPrice(item.estimatedNetRangeBdt.lower)} – ৳{formatPrice(item.estimatedNetRangeBdt.upper)}</p></div></article>)}{marginResults.results.filter(item=>!item.success).map(item=><p key={item.commodity} className="rounded-lg bg-[#f0eadb] p-3 text-sm text-[#66583c]">{item.commodity}: {item.error}</p>)}<p className="rounded-lg bg-[#f0eadb] p-3 text-xs leading-5 text-[#66583c]">{marginResults.limitations}</p></div> : null}
    </section>

    <section className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><TrendingUp className="mt-1 text-[#247A4B]"/><div><h2 className="text-xl font-bold text-[#173B2A]">{bn ? "মাসিক বাজার রেফারেন্স ও পূর্বাভাস" : "Monthly market reference and outlook"}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#62736A]">{bn ? "World Bank-এর মডেল করা মাসিক বাজারদর অনুমান; এটি আজকের DAM দর, পাইকারি বা খুচরা কোট নয়। অঞ্চলভিত্তিক মান বাজারগুলোর মধ্যমা।" : "World Bank modeled monthly market estimates. These are not today’s DAM quotes or classified retail/wholesale prices. Regional points are medians across available markets."}</p></div></div>
        <span className="rounded-full bg-[#E8F2E9] px-3 py-1.5 text-xs font-bold text-[#247A4B]">{bn ? "মাসিক · রেফারেন্স" : "Monthly · reference"}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[#526761]">{bn ? "পণ্য" : "Commodity"}<select value={referenceCrop} onChange={(event) => setReferenceCrop(event.target.value)} disabled={!referenceCatalog?.crops?.length} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]">{(referenceCatalog?.crops || []).map((crop) => <option key={crop.cropId} value={crop.cropId}>{bn && crop.cropNameBn ? crop.cropNameBn : crop.cropNameEn}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#526761]">{bn ? "বিভাগ" : "Division"}<select value={referenceDivision} onChange={(event) => setReferenceDivision(event.target.value)} disabled={!referenceCatalog?.divisions?.length} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]">{(referenceCatalog?.divisions || ["National"]).map((division) => <option key={division} value={division}>{division === "National" ? (bn ? "জাতীয় গড়" : "National average") : division}</option>)}</select></label>
      </div>
      {referenceLoading ? <p className="mt-5 text-sm text-[#62736A]">{bn ? "মাসিক ডেটা লোড হচ্ছে…" : "Loading monthly data…"}</p> : null}
      {!referenceLoading && referenceError ? <p role="status" className="mt-5 rounded-xl bg-[#f0eadb] p-4 text-sm leading-6 text-[#66583c]">{referenceError}</p> : null}
      {!referenceLoading && referenceSeries && referenceChart ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl bg-[#f0eadb] p-4"><span className="text-xs text-[#62736A]">{bn ? "সর্বশেষ মাসিক রেফারেন্স" : "Latest monthly reference"}</span><strong className="mt-1 block text-2xl text-[#173B2A]">৳{formatPrice(referenceSeries.observations.at(-1).price)} <small className="text-sm font-medium">/ {referenceSeries.unit.replace("BDT/", "")}</small></strong><span className="text-xs text-[#62736A]">{referenceSeries.observations.at(-1).date} · {referenceSeries.observations.at(-1).marketEstimateCount} {bn ? "টি বাজার অনুমান" : "market estimates"}</span></article>
          {referenceSeries.forecast ? <article className="rounded-xl bg-[#E8F2E9] p-4"><span className="text-xs text-[#526761]">{bn ? "পরের মাসের মডেল অনুমান" : "Next month model estimate"}</span><strong className="mt-1 block text-2xl text-[#247A4B]">৳{formatPrice(referenceSeries.forecast.price)} <small className="text-sm font-medium">/ {referenceSeries.unit.replace("BDT/", "")}</small></strong><span className="text-xs text-[#526761]">{referenceSeries.forecast.forecastMonth} · {bn ? "ব্যাকটেস্ট পরিসর" : "holdout error band"}: ৳{formatPrice(referenceSeries.forecast.lower90)}–৳{formatPrice(referenceSeries.forecast.upper90)}</span></article> : <article className="rounded-xl bg-[#f0eadb] p-4 text-sm text-[#66583c]">{bn ? "এই সিরিজে পর্যাপ্ত যাচাইযোগ্য মাসিক ইতিহাস নেই; পূর্বাভাস দেখানো হচ্ছে না।" : "This series does not have enough eligible monthly history for a forecast."}</article>}
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-[#e6decc] bg-white p-3 sm:p-4">
          <div className="mb-2 flex justify-between text-xs text-[#62736A]"><span>৳{formatPrice(referenceChart.min)}</span><span>{bn ? "শেষ ৩৬ মাস ও পরের মাস" : "Last 36 months and next month"}</span><span>৳{formatPrice(referenceChart.max)}</span></div>
          <svg role="img" aria-label={bn ? "মাসিক বাজার রেফারেন্স চার্ট" : "Monthly market reference chart"} viewBox={`0 0 ${referenceChart.chartWidth} ${referenceChart.chartHeight}`} className="h-48 w-full" preserveAspectRatio="none"><path d={referenceChart.historyPath} fill="none" stroke="#247A4B" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>{referenceChart.forecastPath ? <path d={referenceChart.forecastPath} fill="none" stroke="#a96b20" strokeWidth="4" strokeDasharray="8 8" strokeLinecap="round"/> : null}</svg>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#62736A]"><span><i className="mr-2 inline-block h-2 w-5 rounded bg-[#247A4B]"/>{bn ? "World Bank ամսিক অনুমান" : "World Bank monthly estimates"}</span>{referenceSeries.forecast ? <span><i className="mr-2 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#a96b20]"/>{bn ? "পরের মাসের পূর্বাভাস" : "Next month forecast"}</span> : null}<span>{bn ? "মডেল" : "Model"}: {referenceSeries.forecast?.selectedModel || (bn ? "যথেষ্ট তথ্য নেই" : "insufficient data")}</span></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-[#62736A]"><p>{referenceSeries.aggregation} · {bn ? "ডেটাসেট সংস্করণ" : "Dataset version"}: {referenceSeries.datasetVersion}. {referenceSeries.limitations}</p><a className="inline-flex flex-none items-center gap-1 font-bold text-[#247A4B] underline" href={referenceSeries.sourceUrl} target="_blank" rel="noreferrer">{bn ? "World Bank উৎস" : "World Bank source"} <ExternalLink size={13}/></a></div>
      </> : null}
    </section>

    <details className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6">
      <summary className="cursor-pointer text-lg font-bold text-[#173B2A]">{bn ? `বাজার ডেটাসেটে থাকা ${sourceCatalog?.cropCount || "সব"}টি পণ্য` : `${sourceCatalog?.cropCount || "All"} products found in market datasets`}</summary>
      <p className="mt-2 text-sm leading-6 text-[#62736A]">{bn ? "এটি উৎস-ইনভেন্টরি, আজকের দাম নয়। মাসিক মডেল এবং ঐতিহাসিক/গবেষণার রেকর্ড আলাদা করে দেখানো হয়েছে।" : "This is a source inventory, not today’s price list. Monthly modeled references and historical/research-only records are labeled separately; they are not live DAM quotes."}</p>
      {sourceCatalog ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sourceCatalog.crops.map((item) => <article key={item.commodity.toLowerCase()} className="rounded-xl border border-[#e6decc] bg-white p-3"><strong className="text-sm text-[#173B2A]">{item.commodity}</strong><div className="mt-1 flex flex-wrap gap-1.5">{item.frequencies.map((frequency) => <span key={frequency} className="rounded-full bg-[#E8F2E9] px-2 py-0.5 text-[10px] font-bold text-[#247A4B]">{frequency}</span>)}{item.recordsBySource.map((source) => <span key={source.sourceKey} title={`${source.records} source records · ${source.status}`} className="rounded-full bg-[#f0eadb] px-2 py-0.5 text-[10px] text-[#66583c]">{source.sourceKey === "worldbank_rtfp" ? (bn ? "মাসিক মডেল" : "monthly model") : (bn ? "ঐতিহাসিক/রিভিউ" : "historical / review")}</span>)}</div></article>)}</div> : <p role="status" className="mt-4 text-sm text-[#62736A]">{sourceCatalogError || (bn ? "ডেটা ইনভেন্টরি লোড হচ্ছে…" : "Loading dataset inventory…")}</p>}
      <p className="mt-4 text-xs leading-5 text-[#62736A]">{sourceCatalog?.note}</p>
    </details>

    <section className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3"><Bell className="mt-1 text-[#247A4B]"/><div><h2 className="text-xl font-bold text-[#173B2A]">{c.alerts}</h2><p className="mt-1 text-sm leading-6 text-[#62736A]">{c.alertsText}</p></div></div>
      {!authLoading && !user ? <p className="rounded-xl bg-[#f0eadb] p-4 text-sm text-[#526761]">{c.login} <Link className="font-bold text-[#247A4B] underline" href="/login?redirect=%2Fmarket">{c.signIn}</Link></p> : null}
      {user ? <>
        <form onSubmit={handleCreateAlert} className="grid gap-3 rounded-xl bg-[#f0eadb] p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_.8fr_.8fr_.7fr_auto]">
          <label className="text-xs font-semibold text-[#526761]">{c.crop}<input required maxLength={80} value={commodity} onChange={e=>setCommodity(e.target.value)} placeholder={c.cropEg} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"/></label>
          <label className="text-xs font-semibold text-[#526761]">{c.market}<input maxLength={120} value={market} onChange={e=>setMarket(e.target.value)} placeholder={c.marketEg} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"/></label>
          <label className="text-xs font-semibold text-[#526761]">{c.price}<input required type="number" min="0.01" step="0.01" value={targetPrice} onChange={e=>setTargetPrice(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"/></label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "দরের ধরন" : "Price type"}<select required value={priceType} onChange={e=>setPriceType(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="producer">{priceTypeLabel("producer")}</option><option value="wholesale">{priceTypeLabel("wholesale")}</option><option value="retail">{priceTypeLabel("retail")}</option></select></label>
          <label className="text-xs font-semibold text-[#526761]">{c.unit}<select value={unit} onChange={e=>setUnit(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]"><option value="kg">{c.perKg}</option><option value="maund">{c.perMaund}</option></select></label>
          <button disabled={saving} className="mt-auto inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#247A4B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus size={16}/> {c.save}</button>
        </form>
        {loadingAlerts ? <p className="mt-4 flex items-center gap-2 text-sm text-[#62736A]"><LoaderCircle size={16} className="animate-spin"/> {c.loading}</p> : alerts.length ? <div className="mt-4 space-y-3">{alerts.map((item) => <article key={item._id} className="rounded-xl border border-[#e6decc] bg-white/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[#173B2A]">{item.commodity}{item.market ? ` · ${item.market}` : ""}</h3><p className="mt-1 text-sm text-[#62736A]">{priceTypeLabel(item.priceType)} · {c.at} ৳{formatPrice(item.targetPrice)}/{bn ? (item.unit === "kg" ? "কেজি" : "মণ") : item.unit}{item.lastObservedPrice !== null ? ` · ${c.latest} ৳${formatPrice(item.lastObservedPrice)}/${bn ? (item.unit === "kg" ? "কেজি" : "মণ") : item.unit} (${item.lastObservedOn})` : ` · ${c.noQuote}`}</p>{item.lastTriggeredAt ? <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#9a6226]"><TrendingUp size={14}/>{c.targetHit} ৳{formatPrice(item.lastTriggeredPrice)}/{bn ? (item.unit === "kg" ? "কেজি" : "মণ") : item.unit}</p> : null}</div><button type="button" disabled={saving} onClick={()=>handleDelete(item._id)} aria-label={`${c.remove}: ${item.commodity}`} className="rounded-lg p-2 text-[#8b5045] hover:bg-[#f6e8e1]"><Trash2 size={17}/></button></div>
          <form onSubmit={(event)=>handleQuote(event,item)} className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-[#526761]">{c.quote} · {priceTypeLabel(item.priceType)} (৳/{bn ? (item.unit === "kg" ? "কেজি" : "মণ") : item.unit})<input required type="number" min="0.01" step="0.01" value={quotes[item._id]?.price || ""} onChange={e=>setQuotes(prev=>({...prev,[item._id]:{...prev[item._id],price:e.target.value}}))} className="mt-1 block w-44 rounded-lg border border-[#d9d0ba] bg-white px-3 py-2 text-sm text-[#173B2A]"/></label><label className="text-xs font-semibold text-[#526761]">{c.reportDate}<input required type="date" min={item.lastObservedOn || undefined} max={bangladeshToday()} value={quotes[item._id]?.date || bangladeshToday()} onChange={e=>setQuotes(prev=>({...prev,[item._id]:{...prev[item._id],date:e.target.value}}))} className="mt-1 block rounded-lg border border-[#d9d0ba] bg-white px-3 py-2 text-sm text-[#173B2A]"/></label><button disabled={saving} className="min-h-[38px] rounded-lg border border-[#0d6865] px-4 py-2 text-sm font-bold text-[#247A4B] disabled:opacity-50">{c.check}</button></form>
        </article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-[#d9d0ba] p-4 text-sm text-[#62736A]">{c.noAlerts}</p>}
      </> : null}
      {error ? <p role="alert" className="mt-4 rounded-lg bg-[#f6e8e1] p-3 text-sm text-[#8b4038]">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-lg bg-[#E8F2E9] p-3 text-sm font-medium text-[#247A4B]">{notice}</p> : null}
    </section>

    {/* Farmer-entered transport estimate: no market distances or tariffs are assumed. */}
    <section className="mb-8 rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <MapPin className="mt-1 shrink-0 text-[#247A4B]" />
        <div>
          <h2 className="text-xl font-bold text-[#173B2A]">{bn ? "নিজের পরিবহন খরচ হিসাব করুন" : "Estimate your transport cost"}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#62736A]">
            {bn ? "বাজারের নাম, দূরত্ব, ফসলের পরিমাণ এবং পরিবহনকারীর দেওয়া ভাড়া লিখুন। অ্যাপ কোনো বাজারের দূরত্ব বা ভাড়া ধরে নেয় না।" : "Enter the destination, distance, produce quantity, and a transporter’s quote. The app does not assume market distances or freight rates."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#526761]">{bn ? "গন্তব্য বাজার (ঐচ্ছিক)" : "Destination market (optional)"}
            <input type="text" maxLength={120} value={transportMarket} onChange={(e) => setTransportMarket(e.target.value)} placeholder={bn ? "বাজারের নাম লিখুন" : "Enter a market name"} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]" />
          </label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "দূরত্ব (কিমি, ঐচ্ছিক)" : "Distance (km, optional)"}
            <input type="number" min="0" step="0.1" value={transportDistanceKm} onChange={(e) => setTransportDistanceKm(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]" />
          </label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "বিক্রির জন্য ফসল (কেজি)" : "Produce to sell (kg)"}
            <input type="number" min="0.01" step="0.01" value={produceKg} onChange={(e) => setProduceKg(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]" />
          </label>
          <label className="text-xs font-semibold text-[#526761]">{bn ? "পরিবহনকারীর মোট ভাড়ার কোট (৳)" : "Transporter’s total quote (৳)"}
            <input type="number" min="0.01" step="0.01" value={transportQuote} onChange={(e) => setTransportQuote(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#d9d0ba] bg-white px-3 py-2.5 text-sm text-[#173B2A]" />
          </label>
          <a href={MARKET_DIRECTORY_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#247A4B] underline sm:col-span-2">
            {c.directory} <ArrowUpRight size={13}/>
          </a>
        </div>

        <div className="rounded-xl border border-[#e6decc] bg-[#f0eadb] p-4">
          <h3 className="font-bold text-sm text-[#173B2A]">{bn ? "আপনার দেওয়া কোটের হিসাব" : "Calculation from your quote"}</h3>
          <p className="mt-3 text-xs leading-5 text-[#62736A]">{transportMarket || (bn ? "গন্তব্য বাজার দেওয়া হয়নি" : "No destination entered")}{transportDistanceKm ? ` · ${formatPrice(transportDistanceKm)} ${bn ? "কিমি" : "km"}` : ""}</p>
          {transportTotal != null && Number(produceKg) > 0 ? <div className="mt-4 rounded-lg bg-white p-3 shadow-inner">
            <span className="text-[11px] text-[#62736A]">{bn ? "আপনার দেওয়া মোট ভাড়া" : "Your entered total quote"}</span>
            <strong className="mt-0.5 block text-xl text-[#247A4B]">৳{formatPrice(transportTotal)}</strong>
            <span className="text-[10px] text-[#526761]">৳{formatPrice(transportCostPerKg)} / {bn ? "কেজি" : "kg"}</span>
          </div> : <p className="mt-4 rounded-lg bg-white p-3 text-xs leading-5 text-[#62736A]">{bn ? "পরিমাণ ও পরিবহনকারীর কোট দিলে প্রতি কেজির খরচ হিসাব হবে।" : "Enter the produce quantity and transporter quote to calculate cost per kg."}</p>}
          <p className="mt-3 text-[11px] leading-5 text-[#66583c]">{bn ? "এটি আপনার দেওয়া কোট থেকে হিসাব; বাজার-গড় ভাড়া বা DAM-এর প্রকাশিত পরিবহন হার নয়।" : "This uses the quote you entered; it is not an average market rate or a published DAM freight tariff."}</p>
        </div>
      </div>
    </section>
    <section className="mb-8 grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5"><div className="flex items-center gap-2 text-[#247A4B]"><MapPin size={19}/><h2 className="text-lg font-bold text-[#173B2A]">{c.findMarket}</h2></div><p className="mt-2 text-sm leading-6 text-[#62736A]">{c.directoryText}</p><a href={MARKET_DIRECTORY_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 font-bold text-[#247A4B]">{c.directory} <ArrowUpRight size={16}/></a></article>
      <article className="rounded-2xl border border-[#dfd7c4] bg-[#fbf7ec] p-5"><div className="flex items-center gap-2 text-[#247A4B]"><Store size={19}/><h2 className="text-lg font-bold text-[#173B2A]">{c.buyers}</h2></div><p className="mt-2 text-sm leading-6 text-[#62736A]">{c.buyersText}</p><div className="mt-4 flex flex-wrap gap-4"><a href={CLASSIFIED_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-bold text-[#247A4B]">{c.browse} <ExternalLink size={15}/></a><a href={SELL_POST_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-bold text-[#247A4B]">{c.post} <ArrowUpRight size={15}/></a></div></article>
    </section>
    <div className="flex gap-3 rounded-2xl border border-[#e4d6b4] bg-[#fbf1da] p-4 text-sm leading-6 text-[#66583c]"><Info size={19} className="mt-0.5 flex-none"/><p>{c.caution}</p></div>
  </div>;
}
