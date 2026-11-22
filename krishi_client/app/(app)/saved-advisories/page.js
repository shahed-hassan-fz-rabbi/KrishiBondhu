"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, CalendarDays, LoaderCircle, MapPin, Search, Sprout, Trash2 } from "lucide-react";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { deleteSavedAdvisory, fetchSavedAdvisories } from "@/services/api.js";

const CATEGORY_LABELS = {
  crop_planning: { en: "Crop planning", bn: "ফসল পরিকল্পনা" },
  rotation: { en: "Crop rotation", bn: "ফসল পর্যায়ক্রম" },
  assistant: { en: "AI assistant", bn: "এআই সহকারী" },
};

const SOURCE_LABELS = {
  "/my-farm/plan": { en: "Crop planning", bn: "ফসল পরিকল্পনা" },
  "/rotation-planner": { en: "Crop rotation", bn: "ফসল পর্যায়ক্রম" },
  "/assistant": { en: "AI assistant", bn: "এআই সহকারী" },
};

function SavedAdvisoriesContent() {
  const { locale, t } = useLang();
  const bn = locale === "bn";
  const [advisories, setAdvisories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const loadAdvisories = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setError("");
    try {
      const result = await fetchSavedAdvisories();
      if (result.success) setAdvisories(result.data?.advisories || []);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => active && loadAdvisories());
    return () => { active = false; };
  }, [loadAdvisories]);

  const remove = async (id) => {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      const result = await deleteSavedAdvisory(id);
      if (result.success) {
        setAdvisories((items) => items.filter((item) => item._id !== id));
        setPendingDelete("");
      } else setError(bn ? "পরামর্শটি মুছতে পারেনি। আবার চেষ্টা করুন।" : "Could not remove this advice. Please try again.");
    } catch {
      setError(bn ? "পরামর্শটি মুছতে পারেনি। আবার চেষ্টা করুন।" : "Could not remove this advice. Please try again.");
    } finally { setDeletingId(""); }
  };

  const visibleAdvisories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(bn ? "bn-BD" : "en-US");
    return advisories.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!query) return true;
      return [item.title, item.body, item.cropName, item.upazila, item.districtCode]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase(bn ? "bn-BD" : "en-US").includes(query));
    });
  }, [advisories, bn, category, search]);

  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(bn ? "bn-BD" : "en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium" });
  };
  const source = (path) => SOURCE_LABELS[path]?.[bn ? "bn" : "en"] || (bn ? "তথ্যসূত্র" : "Source page");

  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="mb-6 rounded-3xl border border-line bg-gradient-to-br from-emerald-50 via-surface to-amber-50/60 p-5 shadow-km-sm sm:p-8 dark:from-emerald-950/25 dark:to-amber-950/15">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300"><Bookmark size={17} aria-hidden="true" />{bn ? "আপনার সংগ্রহ" : "Your collection"}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-content sm:text-4xl">{bn ? "সংরক্ষিত পরামর্শ" : "Saved advisories"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{bn ? "ফসল পরিকল্পনা, পর্যায়ক্রম ও সহকারীর সংরক্ষিত পরামর্শ সূত্রসহ ফিরে দেখুন।" : "Return to saved crop guidance with its category, date, location and originating page."}</p>
        </div>
        {!loading && !loadError && <span className="inline-flex min-h-9 w-fit items-center rounded-full border border-line bg-surface px-3 text-xs font-semibold text-muted">{new Intl.NumberFormat(bn ? "bn-BD" : "en-US").format(advisories.length)} {bn ? "টি সংরক্ষিত" : "saved"}</span>}
      </div>
    </header>

    {error && <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger-strong">{error}</p>}
    {loadError && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100" role="alert">
      <p className="text-sm font-semibold">{bn ? "সংরক্ষিত পরামর্শ লোড করা যায়নি" : "Saved advisories could not be loaded"}</p>
      <p className="mt-1 text-sm">{bn ? "সংযোগ পরীক্ষা করে আবার চেষ্টা করুন। কোনো নমুনা পরামর্শ দেখানো হচ্ছে না।" : "Check the connection and retry. No sample advisories are shown."}</p>
      <button type="button" onClick={loadAdvisories} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-amber-500 px-3 py-2 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30">{bn ? "আবার চেষ্টা করুন" : "Try again"}</button>
    </section>}

    {loading && <div className="grid gap-3 md:grid-cols-2" role="status" aria-label={bn ? "সংরক্ষিত পরামর্শ লোড হচ্ছে" : "Loading saved advisories"}>{[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />)}<span className="sr-only">{bn ? "লোড হচ্ছে…" : "Loading saved advice…"}</span></div>}

    {!loading && !loadError && advisories.length === 0 && <section className="rounded-2xl border border-dashed border-line bg-surface p-7 text-center sm:p-10">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sage text-emerald"><Sprout size={23} aria-hidden="true" /></span>
      <h2 className="mt-4 text-lg font-bold text-content">{bn ? "এখনও কিছু সংরক্ষণ করেননি" : "Nothing saved yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{bn ? "ফসল পরিকল্পনা, পর্যায়ক্রমের ব্যাখ্যা বা এআই সহকারীর উত্তরে সংরক্ষণ চাপলে সেটি এখানে থাকবে।" : "Save guidance from crop planning, rotation explanations or the AI assistant and it will appear here."}</p>
      <Link href="/my-farm/plan" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-5 py-2 text-sm font-bold text-white">{bn ? "ফসল পরিকল্পনা খুলুন" : "Open crop planning"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </section>}

    {!loading && !loadError && advisories.length > 0 && <>
      <section aria-label={bn ? "পরামর্শ খুঁজুন ও ফিল্টার করুন" : "Search and filter advisories"} className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:p-4">
        <label className="block text-xs font-semibold text-muted"><span>{bn ? "পরামর্শ খুঁজুন" : "Search advice"}</span><span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={bn ? "শিরোনাম, ফসল বা এলাকার নাম" : "Title, crop, or location"} className="min-h-11 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm font-normal text-content outline-none focus-visible:ring-2 focus-visible:ring-emerald/40" /></span></label>
        <label className="block text-xs font-semibold text-muted"><span>{bn ? "ধরন" : "Category"}</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm font-normal text-content outline-none focus-visible:ring-2 focus-visible:ring-emerald/40"><option value="all">{bn ? "সব পরামর্শ" : "All categories"}</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label[bn ? "bn" : "en"]}</option>)}</select></label>
      </section>

      {visibleAdvisories.length === 0 ? <section className="rounded-2xl border border-dashed border-line bg-surface p-7 text-center"><h2 className="font-semibold text-content">{bn ? "মিলেছে এমন পরামর্শ নেই" : "No advisories match"}</h2><p className="mt-1 text-sm text-muted">{bn ? "খোঁজ বা ধরন পরিবর্তন করে দেখুন।" : "Try another search or category."}</p><button type="button" onClick={() => { setSearch(""); setCategory("all"); }} className="mt-3 min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-medium text-content hover:bg-surface-2">{bn ? "ফিল্টার মুছুন" : "Clear filters"}</button></section>
        : <ul className="grid list-none gap-4 p-0 md:grid-cols-2">{visibleAdvisories.map((item) => {
          const categoryLabel = CATEGORY_LABELS[item.category]?.[bn ? "bn" : "en"] || (bn ? "সংরক্ষিত পরামর্শ" : "Saved advice");
          const sourcePath = item.sourceHref || "/my-farm/plan";
          return <li key={item._id} className="min-w-0">
            <article className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-km-sm transition-shadow hover:shadow-md sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-emerald"><Sprout size={13} aria-hidden="true" />{item.cropName || categoryLabel}</span><span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{categoryLabel}</span></div><h2 className="mt-3 break-words text-lg font-bold leading-6 text-content">{item.title}</h2></div>
                <button type="button" disabled={Boolean(deletingId)} onClick={() => setPendingDelete((current) => current === item._id ? "" : item._id)} aria-label={bn ? `${item.title} মুছুন` : `Remove ${item.title}`} aria-expanded={pendingDelete === item._id} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-danger/40 hover:bg-danger/5 hover:text-danger-strong disabled:opacity-50"><Trash2 size={17} aria-hidden="true" /></button>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" />{date(item.createdAt)}</span>{(item.upazila || item.districtCode) && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{[item.upazila, item.districtCode ? t(`rotation.districts.${item.districtCode}`) : ""].filter(Boolean).join(", ")}</span>}</p>
              {pendingDelete === item._id && <div role="group" aria-label={bn ? "পরামর্শ মুছে ফেলার নিশ্চয়তা" : "Confirm advisory removal"} aria-live="polite" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3"><p className="text-sm font-medium text-content">{bn ? "এই সংরক্ষিত পরামর্শটি সরাবেন?" : "Remove this saved advisory?"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setPendingDelete("")} className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-content">{bn ? "বাতিল" : "Cancel"}</button><button type="button" onClick={() => remove(item._id)} disabled={Boolean(deletingId)} className="min-h-10 rounded-lg bg-danger-strong px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{deletingId === item._id ? (bn ? "সরানো হচ্ছে…" : "Removing…") : (bn ? "সরিয়ে ফেলুন" : "Remove")}</button></div></div>}
              <details className="mt-4 border-t border-line pt-3">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-content focus-visible:outline-2 focus-visible:outline-emerald">{bn ? "পরামর্শটি পড়ুন" : "Read advisory"}</summary>
                <p className="whitespace-pre-line break-words pb-2 text-sm leading-7 text-content">{item.body}</p>
              </details>
              <div className="mt-auto border-t border-line pt-3">
                <span className="text-[11px] text-muted">{bn ? "সংরক্ষণের উৎস" : "Saved from"}: </span>
                <Link href={sourcePath} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline dark:text-forest-300">{source(sourcePath)}<ArrowUpRight size={14} aria-hidden="true" /></Link>
              </div>
            </article>
          </li>;
        })}</ul>}
    </>}
  </main>;
}

export default function SavedAdvisoriesPage() {
  return <PrivateAccess><SavedAdvisoriesContent /></PrivateAccess>;
}
