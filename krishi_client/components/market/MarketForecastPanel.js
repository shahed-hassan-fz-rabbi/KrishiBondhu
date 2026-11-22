"use client";

import { useState } from "react";
import { LoaderCircle, TrendingUp } from "lucide-react";
import { ForecastPriceChart } from "@/components/market/MarketPriceChart.js";
import { fetchMarketPriceForecast } from "@/services/api.js";

const copy = {
  en: {
    title: "Eligible price forecast", note: "Forecasts are requested only for this selected verified series and exact location. Backtest results describe past tests; they do not guarantee future prices.", run: "Request forecast", loading: "Checking forecast eligibility…", choose: "Select a specific verified location above to check forecast availability.",
    unsupported: "A forecast is not available for this selected history and horizon.", stale: "The latest observation is too old for a forecast. A forecast is withheld until a fresh verified report is imported.", insufficient: "There is not enough verified history for this forecast.", ambiguous: "This history still contains more than one location, source, or unit. Select a more specific series before forecasting.", generic: "The forecast service could not return a prediction for this selection.",
    latest: "Latest verified observation", forecast: "Forecast range from returned model", history: "History", backtest: "Selected model backtest MAE", benchmark: "Last observation benchmark MAE", selected: "Selected model", limitation: "Prediction range is based on backtest errors. It may not reflect sudden weather, policy, or supply changes.", empty: "No forecast points were returned.", horizon: "Horizon", days7: "7 days", days30: "30 days", days28: "28 days",
  },
  bn: {
    title: "যোগ্য হলে দরের পূর্বাভাস", note: "নির্বাচিত যাচাইকৃত সিরিজ ও নির্দিষ্ট এলাকার জন্যই পূর্বাভাস চাওয়া হয়। ব্যাকটেস্ট অতীতের ফল; এটি ভবিষ্যৎ দরের নিশ্চয়তা নয়।", run: "পূর্বাভাস যাচাই করুন", loading: "পূর্বাভাসের যোগ্যতা যাচাই হচ্ছে…", choose: "পূর্বাভাসের সুযোগ যাচাই করতে আগে নির্দিষ্ট যাচাইকৃত এলাকা বেছে নিন।",
    unsupported: "এই নির্বাচিত ইতিহাস ও সময়সীমার জন্য পূর্বাভাস পাওয়া যায়নি।", stale: "সর্বশেষ পর্যবেক্ষণটি পূর্বাভাসের জন্য পুরোনো। নতুন যাচাইকৃত রিপোর্ট না আসা পর্যন্ত পূর্বাভাস দেখানো হবে না।", insufficient: "এই পূর্বাভাসের জন্য যাচাইকৃত ইতিহাস যথেষ্ট নয়।", ambiguous: "এই ইতিহাসে একাধিক এলাকা, উৎস বা একক আছে। পূর্বাভাসের আগে আরও নির্দিষ্ট সিরিজ বেছে নিন।", generic: "এই নির্বাচনের জন্য পূর্বাভাস সেবা অনুমান দিতে পারেনি।",
    latest: "সর্বশেষ যাচাইকৃত পর্যবেক্ষণ", forecast: "মডেল থেকে পাওয়া পূর্বাভাসের সীমা", history: "ইতিহাস", backtest: "নির্বাচিত মডেলের ব্যাকটেস্ট MAE", benchmark: "সর্বশেষ দরের বেঞ্চমার্ক MAE", selected: "নির্বাচিত মডেল", limitation: "পরিসরটি ব্যাকটেস্টের ভুলের ওপর ভিত্তি করে। হঠাৎ আবহাওয়া, নীতি বা সরবরাহ পরিবর্তন এতে নাও ধরা পড়তে পারে।", empty: "কোনো পূর্বাভাস বিন্দু পাওয়া যায়নি।", horizon: "সময়সীমা", days7: "৭ দিন", days30: "৩০ দিন", days28: "২৮ দিন",
  },
};

function formatMoney(value, locale) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(Number(value)) : "—";
}

export default function MarketForecastPanel({ series, location, locale = "en" }) {
  const bn = locale === "bn";
  const text = copy[bn ? "bn" : "en"];
  const [horizonDays, setHorizonDays] = useState("7");
  const [result, setResult] = useState(null);
  const [errorCode, setErrorCode] = useState("");
  const [loading, setLoading] = useState(false);

  const requestForecast = async (event) => {
    event.preventDefault();
    if (!series || !location) return;
    setLoading(true);
    setErrorCode("");
    setResult(null);
    try {
      const response = await fetchMarketPriceForecast({
        commodity: series.commodity,
        division: location.division,
        district: location.district,
        upazila: location.upazila,
        market: location.market,
        unit: series.unit,
        source: series.source,
        priceType: series.priceType,
        frequency: series.frequency,
        horizonDays: series.frequency === "weekly" ? 28 : Number(horizonDays),
      });
      if (response?.success && response.data) setResult(response.data);
      else setErrorCode(response?.error?.code || "UNAVAILABLE");
    } catch {
      setErrorCode("UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  };

  const errorText = errorCode === "STALE_MARKET_HISTORY" ? text.stale
    : errorCode === "MARKET_HISTORY_UNAVAILABLE" ? text.insufficient
      : ["MARKET_LOCATION_AMBIGUOUS", "MARKET_SOURCE_AMBIGUOUS", "MARKET_UNIT_AMBIGUOUS"].includes(errorCode) ? text.ambiguous
        : errorCode ? text.generic : "";

  return <section aria-labelledby="market-forecast-heading" className="rounded-2xl border border-amber-200 bg-gradient-to-br from-[#fffaf0] to-white p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d99631]/15 text-[#86591b]"><TrendingUp className="h-5 w-5" aria-hidden="true" /></span><div><h3 id="market-forecast-heading" className="font-semibold text-[#173b2a]">{text.title}</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-[#626e64]">{text.note}</p></div></div>
    {!series || !location ? <p role="status" className="mt-4 rounded-xl border border-dashed border-[#dfd7c4] bg-white/70 p-3 text-sm text-[#626e64]">{text.choose}</p> : <form onSubmit={requestForecast} className="mt-4 flex flex-wrap items-end gap-3">
      {series.frequency === "weekly" ? <p className="min-h-11 rounded-xl bg-white px-3 py-3 text-xs text-[#626e64]">{text.horizon}: {text.days28}</p> : <label className="min-w-36 text-xs font-semibold text-[#526761]">{text.horizon}<select value={horizonDays} onChange={(event) => setHorizonDays(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d9d0ba] bg-white px-3 text-sm text-[#173b2a]"><option value="7">{text.days7}</option><option value="30">{text.days30}</option></select></label>}
      <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#123d2a] px-4 text-sm font-semibold text-white transition hover:bg-[#0c3322] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <TrendingUp className="h-4 w-4" aria-hidden="true" />}{loading ? text.loading : text.run}</button>
    </form>}
    {errorText ? <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-white/80 p-3 text-sm leading-6 text-[#7a571e]">{errorText}</p> : null}
    {result ? <div className="mt-4 space-y-4">
      {Array.isArray(result.data?.forecast) && result.data.forecast.length ? <div className="rounded-xl border border-[#eadfc8] bg-white p-3 sm:p-4"><p className="mb-2 text-sm font-semibold text-[#173b2a]">{text.forecast} · ৳/{result.meta?.unit || series.unit}</p><ForecastPriceChart data={result.data.forecast} locale={locale} /></div> : <p role="status" className="rounded-xl border border-dashed border-[#dfd7c4] bg-white p-3 text-sm text-[#626e64]">{text.empty}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl bg-white p-3"><p className="text-xs text-[#626e64]">{text.latest}</p><strong className="mt-1 block text-xl text-[#173b2a]">৳{formatMoney(result.data?.latestObservedPrice, locale)} <span className="text-xs font-normal">/ {result.meta?.unit || series.unit}</span></strong><p className="mt-1 text-xs text-[#626e64]">{result.data?.latestObservedOn || "—"}</p></article>
        <article className="rounded-xl bg-white p-3"><p className="text-xs text-[#626e64]">{text.history}</p><p className="mt-1 text-sm font-semibold text-[#173b2a]">{result.meta?.historyStart || "—"} — {result.meta?.historyEnd || "—"}</p><p className="mt-1 text-xs text-[#626e64]">{result.meta?.observationsUsed ?? "—"} {bn ? "টি পর্যবেক্ষণ" : "observations"}</p></article>
        <article className="rounded-xl bg-white p-3"><p className="text-xs text-[#626e64]">{text.selected}</p><p className="mt-1 text-sm font-semibold text-[#173b2a]">{result.meta?.selectedModel || "—"}</p><p className="mt-1 text-xs text-[#626e64]">{result.meta?.source || series.source} · {result.meta?.priceType || series.priceType}</p></article>
        <article className="rounded-xl bg-white p-3"><p className="text-xs text-[#626e64]">{text.backtest}</p><p className="mt-1 text-lg font-semibold text-[#173b2a]">৳{formatMoney(result.meta?.backtest?.selected?.mae, locale)} / {result.meta?.unit || series.unit}</p></article>
        <article className="rounded-xl bg-white p-3"><p className="text-xs text-[#626e64]">{text.benchmark}</p><p className="mt-1 text-lg font-semibold text-[#173b2a]">৳{formatMoney(result.meta?.backtest?.candidateMetrics?.last_observation?.mae, locale)} / {result.meta?.unit || series.unit}</p></article>
        <article className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-[#76551e]">{text.limitation}</article>
      </div>
      {result.sourceUrl ? <a className="inline-flex min-h-10 items-center text-sm font-semibold text-[#247a4b] underline underline-offset-4" href={result.sourceUrl} target="_blank" rel="noreferrer">{result.meta?.source || series.source || "Source"} · {result.licence || ""}</a> : null}
    </div> : null}
  </section>;
}
