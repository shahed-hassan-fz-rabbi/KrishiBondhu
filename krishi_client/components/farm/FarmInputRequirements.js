"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Droplets, ExternalLink, Leaf, LoaderCircle, Sprout } from "lucide-react";
import { fetchFarmInputRequirements } from "@/services/api.js";

export function FarmInputRequirements({ farm, lang = "bn" }) {
  const [requestState, setRequestState] = useState({ key: null, result: null, failed: false });
  const farmKey = JSON.stringify([farm?._id, farm?.land?.area, farm?.land?.unit, farm?.crop?.cropCode, farm?.crop?.variety]);
  const loading = requestState.key !== farmKey;
  const result = loading ? null : requestState.result;
  const failed = !loading && requestState.failed;
  const isBn = lang === "bn";
  const number = (value) => new Intl.NumberFormat(isBn ? "bn-BD" : "en-US", { maximumFractionDigits: 2 }).format(value);

  useEffect(() => {
    let active = true;
    fetchFarmInputRequirements(farm?._id)
      .then((response) => {
        if (!active) return;
        setRequestState({ key: farmKey, result: response.success ? response.data : null, failed: !response.success });
      })
      .catch(() => { if (active) setRequestState({ key: farmKey, result: null, failed: true }); });
    return () => { active = false; };
  }, [farm?._id, farm?.land?.area, farm?.land?.unit, farm?.crop?.cropCode, farm?.crop?.variety, farmKey]);

  return <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-surface shadow-km-sm dark:border-emerald-900">
    <div className="border-b border-line bg-gradient-to-r from-emerald-50/80 via-surface to-lime-50/50 p-5 dark:from-emerald-950/30 dark:to-lime-950/20 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-forest dark:bg-emerald-900/50 dark:text-emerald-300"><Sprout className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-content">{isBn ? "জমির পরিমাণ অনুযায়ী উপকরণ" : "Inputs for your land area"}</h2>
          <p className="mt-1 text-sm text-muted">{isBn ? `${farm?.crop?.cropName || "ফসল"} · ${number(result?.area?.value ?? farm?.land?.area)} ${farm?.land?.unit || "decimal"}` : `${farm?.crop?.cropName || "Crop"} · ${number(result?.area?.value ?? farm?.land?.area)} ${farm?.land?.unit || "decimal"}`}</p>
        </div>
      </div>
    </div>

    {loading ? <div className="flex items-center gap-2 p-5 text-sm text-muted" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />{isBn ? "উৎসভিত্তিক হিসাব আনা হচ্ছে…" : "Loading source-based calculation…"}</div> : failed || !result ?
      <p className="m-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{isBn ? "হিসাব আনা যায়নি। আবার চেষ্টা করুন অথবা জমির তথ্য সংরক্ষিত আছে কি না দেখুন।" : "Could not load the calculation. Please retry or check that the field details are saved."}</p> : <div className="space-y-4 p-5 sm:p-6">
        {result.status !== "source_backed_area_calculation" ? <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{isBn ? result.messageBn : result.messageEn}</p> : <>
          <p className="text-sm leading-6 text-muted">{isBn ? result.basis : `${result.basis} Rates are scaled from the official per-bigha reference to the saved field area.`}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.requirements.fertilizers?.map((item) => <article key={item.nameEn} className="rounded-2xl border border-line bg-bg/60 p-4"><p className="text-xs font-semibold text-muted">{isBn ? item.nameBn : item.nameEn}</p><p className="mt-1 text-lg font-bold text-content">{number(item.amountKg)} {isBn ? "কেজি" : "kg"}</p></article>)}
            {result.requirements.compost && <article className="rounded-2xl border border-line bg-bg/60 p-4"><p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Leaf className="h-3.5 w-3.5" />{isBn ? "জৈব সার / কম্পোস্ট" : "Organic manure / compost"}</p><p className="mt-1 text-lg font-bold text-content">{number(result.requirements.compost.amountKg)} {isBn ? "কেজি" : "kg"}</p></article>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20"><p className="flex items-center gap-1.5 text-sm font-bold text-content"><Sprout className="h-4 w-4 text-sky-700" />{isBn ? "বীজ" : "Seed"}</p><p className="mt-1 text-sm leading-6 text-muted">{isBn ? "এই জাতের জন্য নির্ভরযোগ্য বীজের হার পাওয়া যায়নি; পরিমাণ দেখানো হয়নি।" : "A reliable seed rate for this variety was not found, so no quantity is shown."}</p></div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20"><p className="flex items-center gap-1.5 text-sm font-bold text-content"><Droplets className="h-4 w-4 text-sky-700" />{isBn ? "পানি ব্যবস্থাপনা" : "Water management"}</p><p className="mt-1 text-sm leading-6 text-muted">{isBn ? result.waterGuidance.bn : result.waterGuidance.en}</p></div>
          </div>
          <p className="text-xs leading-5 text-muted">{isBn ? "এটি জাতভিত্তিক প্রকাশিত হারকে জমির আয়তনে গাণিতিকভাবে রূপান্তর। BARC-এর নির্দেশিকা অনুযায়ী চূড়ান্ত সারমাত্রা মাটির পরীক্ষা ও এলাকার ওপর নির্ভরশীল—প্রয়োগের আগে স্থানীয় কৃষি কর্মকর্তার সঙ্গে মিলিয়ে নিন।" : "This is an area-scaled cultivar reference, not a site-specific soil-test prescription. BARC guidance varies with soil test and location; confirm with your local agriculture officer before application."}</p>
        </>}
        {result.sources?.length > 0 && <div className="border-t border-line pt-3"><p className="text-xs font-bold uppercase tracking-wide text-content-muted">{isBn ? "মূল উৎস" : "Original sources"}</p><ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{result.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline dark:text-emerald-300">{source.organization}: {source.title}<ExternalLink className="h-3 w-3" /></a></li>)}</ul><p className="mt-2 text-xs text-muted">{isBn ? "উৎস যাচাই: " : "Source checked: "}{result.sourceCheckedOn}</p></div>}
      </div>}
  </section>;
}
