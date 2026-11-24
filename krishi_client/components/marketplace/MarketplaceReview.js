"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { fetchAdminMarketplaceProducts, reviewMarketplaceProduct } from "@/services/api.js";

const TEXT = {
  en: {
    eyebrow: "ADMIN · MARKETPLACE MODERATION",
    title: "Review farmer listings",
    intro: "New listings are saved to the database but stay hidden from buyers until you approve them. Reject misleading posts with a short reason.",
    loading: "Checking your account…",
    guestTitle: "Sign in required",
    guestBody: "Only signed-in administrators can review listings.",
    login: "Sign in",
    forbiddenTitle: "Admin access required",
    forbiddenBody: "This review queue is available to administrator accounts only.",
    load: "Loading the review queue…",
    error: "Could not load the queue. Please retry.",
    retry: "Try again",
    empty: "Nothing to review here right now.",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    all: "All",
    quantity: "Quantity",
    location: "Pickup area",
    asking: "Farmer asking price",
    submitted: "Submitted",
    approve: "Approve",
    reject: "Reject",
    rejectReason: "Reason for rejection (required)",
    rejectPlaceholder: "For example: misleading photo",
    approving: "Approving…",
    rejecting: "Rejecting…",
    approvedDone: "Listing approved — it is now visible to buyers.",
    rejectedDone: "Listing rejected. The farmer can see your note.",
    actionError: "The review could not be saved. Please try again.",
    noDescription: "No description provided.",
    bdt: "BDT",
    unit: { kg: "kg", quintal: "quintal", ton: "ton" },
    back: "Back to Marketplace",
  },
  bn: {
    eyebrow: "অ্যাডমিন · মার্কেটপ্লেস পর্যালোচনা",
    title: "কৃষকের তালিকা পর্যালোচনা",
    intro: "নতুন তালিকা ডাটাবেজে সংরক্ষিত হয় কিন্তু আপনি অনুমোদন না করা পর্যন্ত ক্রেতারা দেখতে পাননি। ভুল তথ্য হলে সংক্ষিপ্ত কারণসহ প্রত্যাখ্যান করুন।",
    loading: "আপনার অ্যাকাউন্ট যাচাই হচ্ছে…",
    guestTitle: "সাইন ইন প্রয়োজন",
    guestBody: "শুধু সাইন-ইন করা অ্যাডমিন তালিকা পর্যালোচনা করতে পারেন।",
    login: "সাইন ইন",
    forbiddenTitle: "অ্যাডমিন অনুমতি প্রয়োজন",
    forbiddenBody: "এই পর্যালোচনা তালিকা শুধু অ্যাডমিন অ্যাকাউন্টের জন্য।",
    load: "পর্যালোচনা তালিকা লোড হচ্ছে…",
    error: "তালিকা আনা যায়নি। আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    empty: "এখন পর্যালোচনার কিছু নেই।",
    pending: "অপেক্ষমাণ",
    approved: "অনুমোদিত",
    rejected: "প্রত্যাখ্যাত",
    all: "সব",
    quantity: "পরিমাণ",
    location: "পণ্য নেওয়ার এলাকা",
    asking: "কৃষকের চাওয়া দাম",
    submitted: "জমা দেওয়া",
    approve: "অনুমোদন",
    reject: "প্রত্যাখ্যাত",
    rejectReason: "প্রত্যাখ্যানের কারণ (আবশ্যক)",
    rejectPlaceholder: "যেমন: ভুল ছবি",
    approving: "অনুমোদন হচ্ছে…",
    rejecting: "প্রত্যাখ্যাত হচ্ছে…",
    approvedDone: "তালিকা অনুমোদিত — এখন ক্রেতারা দেখতে পাবেন।",
    rejectedDone: "তালিকা প্রত্যাখ্যাত। কৃষক আপনার মন্তব্য দেখতে পাবেন।",
    actionError: "পর্যালোচনা সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
    noDescription: "কোনো বিবরণ দেওয়া হয়নি।",
    bdt: "টাকা (BDT)",
    unit: { kg: "কেজি", quintal: "কুইন্টাল", ton: "টন" },
    back: "মার্কেটপ্লেসে ফিরে যান",
  },
};

const DECISIONS = [
  { value: "pending_review", key: "pending" },
  { value: "approved", key: "approved" },
  { value: "rejected", key: "rejected" },
  { value: "all", key: "all" },
];

function number(value, locale) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(parsed) : "—";
}

export default function MarketplaceReview() {
  const { user, isLoading: authLoading } = useAuth();
  const { locale } = useLang();
  const text = TEXT[locale === "bn" ? "bn" : "en"];

  const [decision, setDecision] = useState("pending_review");
  const [state, setState] = useState({ status: "loading", products: [], pagination: null });
  const [retryKey, setRetryKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [reasons, setReasons] = useState({});
  const [feedback, setFeedback] = useState({});

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading" }));
    const result = await fetchAdminMarketplaceProducts({ decision, page: 1, limit: 50 });
    if (result.success && Array.isArray(result.data?.products)) {
      setState({ status: "ready", products: result.data.products, pagination: result.data.pagination });
    } else {
      setState({ status: "error", products: [], pagination: null });
    }
  }, [decision]);

  useEffect(() => {
    if (authLoading || user?.role !== "admin") return undefined;
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [authLoading, user?.role, load, retryKey]);

  const act = async (product, action) => {
    if (busyId) return;
    const reason = action === "reject" ? (reasons[product._id] || "").trim() : "";
    if (action === "reject" && !reason) return;
    setBusyId(product._id);
    setFeedback((current) => ({ ...current, [product._id]: null }));
    const result = await reviewMarketplaceProduct(product._id, action, reason);
    if (result.success) {
      setFeedback((current) => ({ ...current, [product._id]: { type: "success", message: action === "approve" ? text.approvedDone : text.rejectedDone } }));
      setState((current) => ({ ...current, products: current.products.filter((item) => item._id !== product._id) }));
    } else {
      setFeedback((current) => ({ ...current, [product._id]: { type: "error", message: result.error?.message || text.actionError } }));
    }
    setBusyId(null);
  };

  const panel = (title, body, action = null) => (
    <section data-bondhu-no-fly className="mx-auto max-w-xl rounded-3xl border border-line bg-white p-6 text-center shadow-sm sm:p-9">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><ShieldCheck className="h-7 w-7" aria-hidden="true" /></span>
      <h1 className="mt-4 text-2xl font-bold text-[#173B2A]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#62736A]">{body}</p>
      {action}
    </section>
  );

  if (authLoading) return <div className="mx-auto max-w-7xl px-4 py-10"><p role="status" className="rounded-2xl bg-white p-6 text-center text-sm text-[#526761]">{text.loading}</p></div>;
  if (!user) return <div className="mx-auto max-w-7xl px-4 py-10">{panel(text.guestTitle, text.guestBody, <Link href={`/login?redirect=${encodeURIComponent("/admin/marketplace")}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white">{text.login}</Link>)}</div>;
  if (user.role !== "admin") return <div className="mx-auto max-w-7xl px-4 py-10">{panel(text.forbiddenTitle, text.forbiddenBody)}</div>;

  return (
    <div data-bondhu-no-fly className="mx-auto w-full max-w-7xl px-4 py-7 text-[#173B2A] sm:px-6 sm:py-9">
      <Link href="/marketplace" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#247A4B] hover:bg-[#eaf2e7]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.back}</Link>
      <header className="mt-4 rounded-3xl border border-[#dfe6d8] bg-gradient-to-br from-[#eef4ea] to-[#f7f3e6] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#46744e]">{text.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{text.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#526761]">{text.intro}</p>
      </header>

      <nav aria-label={text.title} className="mt-6 flex flex-wrap gap-2">
        {DECISIONS.map(({ value, key }) => (
          <button key={value} type="button" onClick={() => setDecision(value)} aria-pressed={decision === value} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-bold ${decision === value ? "border-[#247A4B] bg-[#247A4B] text-white" : "border-[#cbd7c8] bg-white text-[#247A4B] hover:bg-[#f1f7ef]"}`}>{text[key]}</button>
        ))}
      </nav>

      <section aria-live="polite" className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {state.status === "loading" ? <p role="status" className="col-span-full rounded-2xl bg-white p-6 text-center text-sm text-[#526761]">{text.load}</p> : null}
        {state.status === "error" ? <div className="col-span-full rounded-2xl border border-red-200 bg-white p-6 text-center" role="alert"><p className="font-bold">{text.error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#247A4B] px-4 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.retry}</button></div> : null}
        {state.status === "ready" && state.products.length === 0 ? <p className="col-span-full rounded-2xl border border-dashed border-[#cfd9c8] bg-white p-8 text-center text-sm text-[#526761]">{text.empty}</p> : null}
        {state.status === "ready" && state.products.map((product) => {
          const approval = product.approvalStatus || "pending_review";
          const busy = busyId === product._id;
          return (
            <article key={product._id} data-bondhu-no-fly className="flex min-w-0 flex-col rounded-2xl border border-[#e5dfd1] bg-white p-4 shadow-sm sm:p-5">
              {product.productImageDataUrl ? <div className="relative mb-3 h-36 overflow-hidden rounded-xl bg-[#edf2e8]"><Image src={product.productImageDataUrl} alt={product.productName} fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" /></div> : null}
              <div className="flex items-start justify-between gap-2">
                <h2 className="break-words text-lg font-bold leading-snug">{product.productName}</h2>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${approval === "approved" ? "border-green-200 bg-green-50 text-green-800" : approval === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{text[approval === "approved" ? "approved" : approval === "rejected" ? "rejected" : "pending"]}</span>
              </div>
              <p className="mt-3 break-words rounded-xl bg-[#f5f4ed] p-3 text-sm font-bold text-[#247A4B]">{text.bdt} {number(product.askingPricePerUnit, locale)}/{text.unit[product.unit] || product.unit}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-[#68776e]">{text.quantity}</dt><dd className="mt-0.5 font-semibold">{number(product.quantity, locale)} {text.unit[product.unit] || product.unit}</dd></div>
                <div><dt className="text-[#68776e]">{text.location}</dt><dd className="mt-0.5 break-words font-semibold">{[product.upazila, product.district].filter(Boolean).join(", ")}</dd></div>
              </dl>
              <p className="mt-3 break-words text-sm leading-5 text-[#526761]">{product.description || text.noDescription}</p>
              {product.reviewNote ? <p className="mt-2 break-words text-xs text-[#8a3d2c]">{product.reviewNote}</p> : null}

              {approval === "pending_review" ? <>
                <input type="text" value={reasons[product._id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [product._id]: event.target.value }))} maxLength={500} placeholder={text.rejectPlaceholder} aria-label={text.rejectReason} className="mt-4 min-h-11 w-full rounded-xl border border-[#cbd7c8] bg-white px-3 text-sm" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => act(product, "approve")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#247A4B] px-3 text-sm font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{text.approve}</button>
                  <button type="button" disabled={busy || !(reasons[product._id] || "").trim()} onClick={() => act(product, "reject")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#d8b8aa] px-3 text-sm font-bold text-[#8a3d2c] disabled:opacity-45"><X className="h-4 w-4" aria-hidden="true" />{text.reject}</button>
                </div>
              </> : null}

              {feedback[product._id] ? <p role={feedback[product._id].type === "error" ? "alert" : "status"} className={`mt-3 text-sm font-medium ${feedback[product._id].type === "error" ? "text-red-700" : "text-[#247A4B]"}`}>{feedback[product._id].message}</p> : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
