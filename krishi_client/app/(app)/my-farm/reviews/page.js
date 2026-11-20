"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Clock3, LoaderCircle, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { fetchMyOfficerReviews } from "@/services/api.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

function MyReviewsContent() {
  const { locale } = useLang(); const bn = locale === "bn";
  const [reviews, setReviews] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetchMyOfficerReviews().then((result) => {
      if (!active) return;
      if (result.success) setReviews(result.data?.reviews || []);
      else setError(result.error?.message || (bn ? "অনুরোধ আনা যায়নি।" : "Could not load your requests."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bn]);
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><Link href="/my-farm/plan" className="inline-flex items-center gap-2 text-sm font-semibold text-forest-700 dark:text-forest-300"><ArrowLeft size={16}/>{bn ? "ফসল পরিকল্পনায় ফিরুন" : "Back to crop planning"}</Link><h1 className="mt-4 text-3xl font-bold text-content">{bn ? "কৃষি কর্মকর্তার পর্যালোচনা" : "Officer review requests"}</h1><p className="mt-2 text-sm text-muted">{bn ? "আপনার পাঠানো পরিকল্পনার অবস্থা ও কর্মকর্তার উত্তর এখানে দেখুন।" : "Track submitted plans and read the officer’s response here."}</p>
    {loading&&<p className="mt-6 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="animate-spin" size={16}/>{bn ? "লোড হচ্ছে…" : "Loading…"}</p>}{error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}
    {!loading&&!error&&reviews.length===0&&<p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{bn ? "এখনো কোনো পর্যালোচনার অনুরোধ পাঠাননি।" : "You have not sent any review requests yet."}</p>}
    <div className="mt-6 space-y-4">{reviews.map((review)=><article key={review._id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-content">{review.cropPlan.cropName} · {review.upazila}, {review.districtCode}</h2><p className="mt-1 text-sm text-muted">{bn ? "আপনার প্রশ্ন:" : "Your question:"} {review.farmerQuestion}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${review.status === "REVIEWED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`}>{review.status === "REVIEWED" ? <BadgeCheck size={14}/> : <Clock3 size={14}/>} {review.status === "REVIEWED" ? (bn ? "উত্তর এসেছে" : "Reviewed") : (bn ? "অপেক্ষমাণ" : "Pending")}</span></div>{review.status === "REVIEWED"&&<div className="mt-4 rounded-xl bg-surface-2 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-content"><MessageSquareText size={16}/>{bn ? `কর্মকর্তা ${review.officerId?.name ? `(${review.officerId.name})` : ""} এর উত্তর` : `Officer response ${review.officerId?.name ? `(${review.officerId.name})` : ""}`}</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-content">{review.officerResponse}</p></div>}</article>)}</div>
  </main>;
}
export default function MyReviewsPage() { return <PrivateAccess><MyReviewsContent/></PrivateAccess>; }
