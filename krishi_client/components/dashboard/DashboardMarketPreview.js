"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { fetchMarketDataStatus, fetchMarketPriceHistory, fetchVerifiedMarketPriceCatalog } from "@/services/api.js";

const freshnessLabel = (ageDays, isBn) => {
  if (!Number.isFinite(ageDays)) return isBn ? "তারিখ যাচাই করা যায়নি" : "Freshness unavailable";
  return isBn ? `${ageDays} দিন আগে পর্যবেক্ষিত` : `Observed ${ageDays} days ago`;
};

export default function DashboardMarketPreview() {
  const { locale } = useLang();
  const isBn = locale === "bn";
  const [state, setState] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    let active = true;
    Promise.all([fetchVerifiedMarketPriceCatalog(), fetchMarketDataStatus().catch(() => null)]).then(async ([catalogResponse, statusResponse]) => {
      const stale = statusResponse?.success ? Boolean(statusResponse.data?.latestVerifiedDailyObservation?.stale) : null;
      const series = catalogResponse?.success ? (catalogResponse.data?.series || []).slice(0, 3) : [];
      if (!series.length) {
        if (active) setState({ status: catalogResponse?.success ? "empty" : "unavailable", rows: [], stale });
        return;
      }
      const results = await Promise.all(series.map(async (item) => {
        try {
          const response = await fetchMarketPriceHistory({ commodity: item.commodity, division: item.division, priceType: item.priceType, frequency: item.frequency, unit: item.unit });
          const observation = response?.success ? response.data?.observations?.at(-1) : null;
          if (!observation) return { item, observation: null, error: !response?.success };
          const time = Date.parse(`${observation.observedOn}T00:00:00Z`);
          const ageDays = Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86400000)) : null;
          return { item, observation, ageDays };
        } catch {
          return { item, observation: null, error: true };
        }
      }));
      if (active) setState({ status: "ready", rows: results, stale });
    }).catch(() => {
      if (active) setState({ status: "unavailable", rows: [] });
    });
    return () => { active = false; };
  }, []);

  return <section aria-labelledby="dashboard-market-title" className="rounded-2xl border border-line bg-surface p-4 shadow-km-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald/10 text-emerald"><Store className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">{isBn ? "যাচাইকৃত বাজার পর্যবেক্ষণ" : "VERIFIED MARKET OBSERVATIONS"}</p><h2 id="dashboard-market-title" className="mt-1 text-base font-semibold text-content">{isBn ? "সর্বশেষ পাওয়া বাজার তথ্য" : "Latest available market data"}</h2></div></div><Link href="/market" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald hover:underline">{isBn ? "বাজার তথ্য" : "Market intelligence"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
    {state.status === "loading" ? <p role="status" className="mt-4 animate-pulse text-sm text-muted">{isBn ? "যাচাইকৃত পর্যবেক্ষণ লোড হচ্ছে…" : "Loading verified observations…"}</p>
      : state.status !== "ready" ? <p role="status" className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{state.status === "unavailable" ? (isBn ? "বাজার তথ্য সেবা সাময়িকভাবে অনুপলব্ধ।" : "Market data is temporarily unavailable.") : (isBn ? "যাচাইকৃত বাজার পর্যবেক্ষণ পাওয়া যায়নি।" : "No verified market observations are available.")}</p>
        : <><p className={`mt-4 rounded-lg border px-3 py-2 text-xs ${state.stale ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-surface-2/40 text-muted"}`}>{state.stale ? (isBn ? "বাজার ডেটা সেবার সর্বশেষ দৈনিক পর্যবেক্ষণটি পুরোনো হিসেবে চিহ্নিত; বর্তমান দর নয়।" : "The latest daily observation is flagged stale by the market data service; it is not a current quote.") : (isBn ? "প্রতিটি দরের পর্যবেক্ষণ তারিখ নিচে দেওয়া আছে।" : "Each quote's observation date is shown below.")}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{state.rows.map(({ item, observation, ageDays, error }) => <article key={`${item.commodity}|${item.division}|${item.priceType}|${item.unit}`} className="min-w-0 rounded-xl border border-line bg-surface-2/50 p-3.5">{observation ? <><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-content">{observation.commodity || item.commodity}</h3><span className="rounded-full bg-emerald/10 px-2 py-1 text-[10px] font-semibold text-emerald">{observation.market || observation.upazila || observation.district || observation.division || item.division || (isBn ? "জাতীয়" : "National")}</span></div><p className="mt-2 text-lg font-semibold text-content">৳{observation.priceMin === observation.priceMax ? observation.priceMin : `${observation.priceMin}–${observation.priceMax}`} <span className="text-xs font-medium text-muted">/ {observation.unit || item.unit || "—"}</span></p><dl className="mt-2 space-y-1 text-xs text-muted"><div><dt className="inline">{isBn ? "ধরন: " : "Price type: "}</dt><dd className="inline">{observation.priceType || item.priceType || "—"}</dd></div><div><dt className="inline">{isBn ? "তারিখ: " : "Observed: "}</dt><dd className="inline">{observation.observedOn || (isBn ? "তারিখ নেই" : "Date unavailable")}</dd></div><div><dt className="inline">{isBn ? "উৎস: " : "Source: "}</dt><dd className="inline">{observation.source || item.sources?.[0] || "—"}</dd></div><div>{freshnessLabel(ageDays, isBn)}</div></dl></> : <><h3 className="font-semibold text-content">{item.commodity}</h3><p className="mt-2 text-sm text-muted">{error ? (isBn ? "এই বাজার পর্যবেক্ষণ লোড করা যায়নি।" : "This market observation could not be loaded.") : (isBn ? "এই শ্রেণির সর্বশেষ যাচাইকৃত দর পাওয়া যায়নি।" : "No verified quote found for this series.")}</p><p className="mt-2 text-xs text-muted">{item.priceType || "—"} · {item.unit || "—"} · {item.lastObservedOn || (isBn ? "তারিখ নেই" : "Date unavailable")}</p></>}</article>)}</div></>}
    <p className="mt-3 text-xs leading-5 text-muted">{isBn ? "রিপোর্টের তারিখ ও উৎস দেখুন; পুরোনো পর্যবেক্ষণ বর্তমান বাজারদর নয়।" : "Check the report date and source; an older observation is not a current market quote."}</p>
  </section>;
}
