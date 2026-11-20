"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, CalendarDays, LoaderCircle, MapPin, Sprout, Trash2 } from "lucide-react";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { deleteSavedAdvisory, fetchSavedAdvisories } from "@/services/api.js";

function SavedAdvisoriesContent() {
  const { locale } = useLang();
  const bn = locale === "bn";
  const [advisories, setAdvisories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let active = true;
    fetchSavedAdvisories().then((result) => {
      if (!active) return;
      if (result.success) setAdvisories(result.data?.advisories || []);
      else setError(bn ? "সংরক্ষিত পরামর্শ আনা যায়নি। আবার চেষ্টা করুন।" : "Could not load saved advice. Please try again.");
    }).catch(() => {
      if (active) setError(bn ? "সংরক্ষিত পরামর্শ আনা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।" : "Could not load saved advice. Check your connection and try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bn]);

  const remove = async (id) => {
    if (deletingId) return;
    setDeletingId(id); setError("");
    try {
      const result = await deleteSavedAdvisory(id);
      if (result.success) setAdvisories((items) => items.filter((item) => item._id !== id));
      else setError(bn ? "পরামর্শটি মুছতে পারেনি। আবার চেষ্টা করুন।" : "Could not remove this advice. Please try again.");
    } catch { setError(bn ? "পরামর্শটি মুছতে পারেনি। আবার চেষ্টা করুন।" : "Could not remove this advice. Please try again."); }
    finally { setDeletingId(""); }
  };

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <header className="mb-7 rounded-3xl border border-[#e3d9c7] bg-[#eee7d8] p-6 text-[#173B2A] sm:p-9">
      <p className="flex items-center gap-2 text-sm font-bold text-[#9a6226]"><Bookmark size={17}/>{bn ? "আপনার সংগ্রহ" : "Your collection"}</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{bn ? "সংরক্ষিত পরামর্শ" : "Saved advisories"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526761]">{bn ? "ফসল পরিকল্পনার তথ্যসূত্রসহ সংরক্ষিত পরামর্শ এখানে ফিরে দেখুন।" : "Keep crop guidance and its source notes together so you can return to them later."}</p>
    </header>

    {error && <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger-strong">{error}</p>}
    {loading && <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin"/>{bn ? "লোড হচ্ছে…" : "Loading saved advice…"}</p>}
    {!loading && !error && advisories.length === 0 && <section className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sage text-emerald"><Sprout size={23}/></span>
      <h2 className="mt-4 text-lg font-bold text-content">{bn ? "এখনও কিছু সংরক্ষণ করেননি" : "Nothing saved yet"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{bn ? "ফসল পরিকল্পনা, পর্যায়ক্রমের ব্যাখ্যা বা এআই সহকারীর উত্তরে সংরক্ষণ চাপলে সেটি এখানে থাকবে।" : "Save guidance from crop planning, rotation explanations or the AI assistant and it will stay here with its context."}</p>
      <Link href="/my-farm/plan" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-forest px-5 py-2 text-sm font-bold text-white">{bn ? "ফসল পরিকল্পনা খুলুন" : "Open crop planning"}<ArrowUpRight size={16}/></Link>
    </section>}

    {!loading && advisories.length > 0 && <ul className="space-y-4">{advisories.map((item) => <li key={item._id}><article className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-2.5 py-1 text-xs font-semibold text-emerald"><Sprout size={13}/>{item.cropName || (item.category === "assistant" ? (bn ? "এআই সহকারী" : "AI assistant") : (bn ? "ফসল পরামর্শ" : "Crop advice"))}</span><h2 className="mt-3 text-lg font-bold text-content sm:text-xl">{item.title}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span className="inline-flex items-center gap-1"><CalendarDays size={13}/>{new Date(item.createdAt).toLocaleDateString(bn ? "bn-BD" : "en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium" })}</span>{item.upazila && <span className="inline-flex items-center gap-1"><MapPin size={13}/>{item.upazila}{item.districtCode ? `, ${item.districtCode}` : ""}</span>}</p>
        </div>
        <button type="button" disabled={Boolean(deletingId)} onClick={() => remove(item._id)} aria-label={bn ? `${item.title} মুছুন` : `Remove ${item.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-danger/40 hover:bg-danger/5 hover:text-danger-strong disabled:opacity-50"><Trash2 size={17}/></button>
      </div>
      <p className="mt-5 whitespace-pre-line break-words border-t border-line pt-4 text-sm leading-7 text-content">{item.body}</p>
      <Link href={item.sourceHref || "/my-farm/plan"} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline dark:text-forest-300">{item.sourceHref === "/assistant" ? (bn ? "এআই সহকারীতে ফিরে যান" : "Return to AI assistant") : item.sourceHref === "/rotation-planner" ? (bn ? "পর্যায়ক্রম পরিকল্পনায় ফিরে যান" : "Return to crop rotation") : (bn ? "ফসল পরিকল্পনায় ফিরে যান" : "Return to crop planning")}<ArrowUpRight size={15}/></Link>
    </article></li>)}</ul>}
  </main>;
}

export default function SavedAdvisoriesPage() {
  return <PrivateAccess><SavedAdvisoriesContent/></PrivateAccess>;
}
