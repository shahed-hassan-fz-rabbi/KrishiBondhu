"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ClipboardList, LoaderCircle, MessageSquareText, RefreshCw, Search } from "lucide-react";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { fetchOfficerReviewQueue, respondToOfficerReview } from "@/services/api.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

function OfficerReviewsContent() {
  const { user } = useAuth(); const { locale } = useLang(); const bn = locale === "bn";
  const allowed = user?.role === "extension_officer" || user?.role === "admin";
  const [status, setStatus] = useState("PENDING"); const [reviews, setReviews] = useState([]); const [loading, setLoading] = useState(true); const [savingId, setSavingId] = useState(""); const [error, setError] = useState(""); const [responses, setResponses] = useState({}); const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await fetchOfficerReviewQueue(status);
      if (result.success) { setReviews(result.data?.reviews || []); setError(""); }
      else setError(result.error?.message || (bn ? "অনুরোধ আনা যায়নি।" : "Could not load review queue."));
    } catch { setError(bn ? "অনুরোধ আনা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।" : "Could not load review queue. Check the connection and try again."); }
    finally { setLoading(false); }
  }, [status, bn]);
  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    void fetchOfficerReviewQueue(status).then((result) => {
      if (!active) return;
      if (result.success) { setReviews(result.data?.reviews || []); setError(""); }
      else setError(result.error?.message || (bn ? "অনুরোধ আনা যায়নি।" : "Could not load review queue."));
    }).catch(() => { if (active) setError(bn ? "অনুরোধ আনা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।" : "Could not load review queue. Check the connection and try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, status, bn]);
  const submitResponse = async (event, id) => {
    event.preventDefault(); setSavingId(id); setError("");
    const result = await respondToOfficerReview(id, responses[id] || "");
    if (!result.success) setError(result.error?.message || (bn ? "উত্তর সংরক্ষণ হয়নি।" : "Could not save response."));
    else { setReviews((current)=>current.filter((item)=>item._id!==id)); setResponses((current)=>({...current,[id]:""})); }
    setSavingId("");
  };
  const filteredReviews = reviews.filter((review) => [review.cropPlan?.cropName, review.upazila, review.districtCode, review.farmerId?.name, review.farmerQuestion].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  if (!allowed) return <main className="mx-auto max-w-2xl px-4 py-12"><h1 className="text-2xl font-bold text-content">{bn ? "কর্মকর্তার প্রবেশাধিকার প্রয়োজন" : "Officer access required"}</h1><p className="mt-2 text-sm text-muted">{bn ? "এই পর্যালোচনা বোর্ডটি দায়িত্বপ্রাপ্ত কৃষি কর্মকর্তা বা অ্যাডমিনদের জন্য।" : "This review queue is available to assigned extension officers and administrators."}</p></main>;
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-forest-700 dark:text-forest-300"><ClipboardList size={17}/>{bn ? "কৃষি কর্মকর্তা" : "Extension officer"} · {user?.preferredDistrict}</p><h1 className="mt-2 text-3xl font-bold text-content">{bn ? "ফসল পরিকল্পনা পর্যালোচনা" : "Crop plan review queue"}</h1><p className="mt-2 text-sm text-muted">{bn ? "কৃষকের প্রশ্ন ও পরিকল্পনা দেখে মাঠভিত্তিক পরামর্শ লিখুন।" : "Review the farmer’s question and crop context, then record practical field advice."}</p></div><button type="button" onClick={()=>{setLoading(true);void load();}} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-content"><RefreshCw size={15}/>{bn ? "হালনাগাদ" : "Refresh"}</button></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="tablist" aria-label={bn ? "পর্যালোচনার অবস্থা" : "Review status"}><button type="button" role="tab" aria-selected={status==="PENDING"} onClick={()=>{setLoading(true);setError("");setStatus("PENDING");}} className={`rounded-full px-4 py-2 text-sm font-semibold ${status==="PENDING"?"bg-forest text-white":"bg-surface-2 text-content"}`}>{bn ? "অপেক্ষমাণ" : "Pending"}</button><button type="button" role="tab" aria-selected={status==="REVIEWED"} onClick={()=>{setLoading(true);setError("");setStatus("REVIEWED");}} className={`rounded-full px-4 py-2 text-sm font-semibold ${status==="REVIEWED"?"bg-forest text-white":"bg-surface-2 text-content"}`}>{bn ? "পর্যালোচিত" : "Reviewed"}</button></div><label className="relative min-w-[230px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true"/><span className="sr-only">{bn ? "কৃষক, ফসল বা উপজেলা খুঁজুন" : "Search farmers, crops or upazilas"}</span><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={bn ? "কৃষক, ফসল বা উপজেলা খুঁজুন" : "Search farmer, crop or upazila"} className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-content"/></label></div>
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</p>}{loading&&<p className="mt-6 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="animate-spin" size={16}/>{bn ? "লোড হচ্ছে…" : "Loading…"}</p>}
    {!loading&&reviews.length===0&&<p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{bn ? "এই তালিকায় কোনো অনুরোধ নেই।" : "There are no requests in this queue."}</p>}
    {!loading&&reviews.length>0&&filteredReviews.length===0&&<p role="status" className="mt-6 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{bn ? "এই শব্দে কোনো অনুরোধ মেলেনি।" : "No requests match this search."}</p>}
    <div className="mt-6 space-y-4">{filteredReviews.map((review)=><article key={review._id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-content">{review.cropPlan.cropName} · {review.upazila}, {review.districtCode}</h2><p className="mt-1 text-sm text-muted">{review.farmerId?.name}{review.farmerId?.phone ? ` · ${review.farmerId.phone}` : ""} · {new Date(review.createdAt).toLocaleDateString(bn?"bn-BD":"en-BD")}</p></div><span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-content">{review.cropPlan.suitabilityCategory}</span></div><div className="mt-4 rounded-xl bg-surface-2 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">{bn ? "কৃষকের প্রশ্ন" : "Farmer’s question"}</p><p className="mt-1 whitespace-pre-line text-sm text-content">{review.farmerQuestion}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-bold text-muted">{bn ? "পরিকল্পনার কারণ" : "Plan considerations"}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-content">{review.cropPlan.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div><div><p className="text-xs font-bold text-muted">{bn ? "সীমাবদ্ধতা" : "Constraints"}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-content">{review.cropPlan.constraints.map((item,index)=><li key={index}>{item}</li>)}</ul></div></div></div>{review.status==="REVIEWED"?<div className="mt-4 rounded-xl border border-emerald-200 p-4 dark:border-emerald-900"><p className="flex items-center gap-2 text-sm font-semibold text-content"><BadgeCheck size={15}/>{review.officerId?.name||""}</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-content">{review.officerResponse}</p></div>:<form onSubmit={(event)=>submitResponse(event,review._id)} className="mt-4"><label className="flex items-center gap-2 text-sm font-semibold text-content"><MessageSquareText size={15}/>{bn ? "আপনার মাঠভিত্তিক পরামর্শ" : "Your field advice"}<textarea required minLength={10} maxLength={2000} value={responses[review._id]||""} onChange={(event)=>setResponses((current)=>({...current,[review._id]:event.target.value}))} className="mt-2 block min-h-28 w-full rounded-xl border border-line bg-surface px-3 py-2.5 font-normal" placeholder={bn?"কী করণীয়, কী যাচাই করতে হবে এবং স্থানীয় সীমাবদ্ধতা লিখুন…":"Describe next steps, what to check locally, and any limits to your advice…"}/></label><button disabled={savingId===review._id} className="mt-3 rounded-xl bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingId===review._id?(bn?"সংরক্ষণ…":"Saving…"):(bn?"পর্যালোচনা জমা দিন":"Submit review")}</button></form>}</article>)}</div>
  </main>;
}
export default function OfficerReviewsPage() { return <PrivateAccess><OfficerReviewsContent/></PrivateAccess>; }
