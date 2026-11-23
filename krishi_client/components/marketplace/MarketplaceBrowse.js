"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Leaf, MapPin, RefreshCw, Store } from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { fetchMarketplaceProducts } from "@/services/api.js";

const PAGE_SIZE = 12;
const copy = {
  en: {
    eyebrow: "FARMER MARKETPLACE", title: "Produce listed by local farmers", intro: "Browse available crops and produce from farmers. These are seller-set asking prices, not government-verified market observations.", priceType: "Farmer asking price", notDam: "Not a DAM-verified price", per: "per", quantity: "Available quantity", location: "Pickup area", demo: "DEMO / SAMPLE", demoNote: "Fictional sample listing and price", emptyTitle: "No active listings yet", empty: "There are no farmer listings to show right now. Please check again later.", load: "Loading farmer listings…", errorTitle: "Marketplace is temporarily unavailable", error: "We could not load the public listings. Check your connection and retry.", retry: "Try again", previous: "Previous", next: "Next", page: "Page", of: "of", marketLink: "See verified market information", noDescription: "No description provided.", bdt: "BDT", unit: { kg: "kg", quintal: "quintal", ton: "ton" }, browseLabel: "Browse public farmer listings", source: "Listings are provided by farmers; details should be confirmed with the seller before making arrangements."
  },
  bn: {
    eyebrow: "কৃষক মার্কেটপ্লেস", title: "স্থানীয় কৃষকের পণ্য দেখুন", intro: "কৃষকদের দেওয়া ফসল ও পণ্যের তালিকা দেখুন। এখানে দাম বিক্রেতার চাওয়া দাম—সরকারি যাচাইকৃত বাজার পর্যবেক্ষণ নয়।", priceType: "কৃষকের চাওয়া দাম", notDam: "DAM-যাচাইকৃত দাম নয়", per: "প্রতি", quantity: "পণ্যের পরিমাণ", location: "এলাকা", demo: "ডেমো / নমুনা", demoNote: "কাল্পনিক নমুনা পণ্য ও দাম", emptyTitle: "এখনো কোনো পণ্য তালিকাভুক্ত নেই", empty: "এই মুহূর্তে দেখানোর মতো কৃষকের পণ্য নেই। পরে আবার দেখুন।", load: "কৃষকের পণ্যের তালিকা লোড হচ্ছে…", errorTitle: "মার্কেটপ্লেস সাময়িকভাবে পাওয়া যাচ্ছে না", error: "পণ্যের তালিকা আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।", retry: "আবার চেষ্টা করুন", previous: "আগের পৃষ্ঠা", next: "পরের পৃষ্ঠা", page: "পৃষ্ঠা", of: "এর মধ্যে", bdt: "টাকা (BDT)", unit: { kg: "কেজি", quintal: "কুইন্টাল", ton: "টন" }, browseLabel: "কৃষকের পণ্য দেখুন", source: "তালিকাগুলো কৃষকের দেওয়া। কেনার আগে বিক্রেতার সঙ্গে পণ্যের তথ্য ও শর্ত যাচাই করুন।"
  },
};

function isDemoListing(product) {
  return /demo\s*\/\s*sample/i.test(`${product?.productName || ""} ${product?.description || ""}`);
}

function formatPrice(value, locale) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(Number(value));
}

function ProductCard({ product, text, locale }) {
  const demo = isDemoListing(product);
  return <article data-bondhu-no-fly className="flex min-w-0 flex-col rounded-2xl border border-[#e5dfd1] bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><Leaf className="h-6 w-6" aria-hidden="true" /></span>
      {demo ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-amber-900">{text.demo}</span> : null}
    </div>
    <h2 className="mt-4 break-words text-lg font-bold leading-snug text-[#173B2A]">{product.productName}</h2>
    <div className="mt-3 rounded-xl bg-[#f5f4ed] p-3">
      <p className="text-xs font-semibold text-[#526761]">{text.priceType} <span className="font-normal">· {text.notDam}</span></p>
      <p className="mt-1 break-words text-xl font-extrabold text-[#247A4B]">{text.bdt} {formatPrice(product.askingPricePerUnit, locale)} <span className="text-sm font-semibold">/ {text.unit[product.unit] || product.unit}</span></p>
      {demo ? <p className="mt-1 text-[11px] font-medium text-amber-800">{text.demoNote}</p> : null}
    </div>
    <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-[#68776e]">{text.quantity}</dt><dd className="mt-0.5 font-semibold text-[#274638]">{formatPrice(product.quantity, locale)} {text.unit[product.unit] || product.unit}</dd></div>
      <div><dt className="text-xs text-[#68776e]">{text.location}</dt><dd className="mt-0.5 flex items-start gap-1 font-semibold text-[#274638]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#247A4B]" aria-hidden="true" /><span className="break-words">{product.upazila}, {product.district}</span></dd></div>
    </dl>
    <p className="mt-4 line-clamp-3 min-h-[3.75rem] break-words text-sm leading-5 text-[#62736A]">{product.description || text.noDescription}</p>
  </article>;
}

export default function MarketplaceBrowse() {
  const { locale } = useLang();
  const bn = locale === "bn";
  const text = copy[bn ? "bn" : "en"];
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState({ status: "loading", products: [], pagination: null });

  useEffect(() => {
    let active = true;
    fetchMarketplaceProducts({ page, limit: PAGE_SIZE }).then((response) => {
      if (!active) return;
      if (response.success && Array.isArray(response.data?.products) && response.data?.pagination) {
        setState({ status: "ready", products: response.data.products, pagination: response.data.pagination });
      } else {
        setState({ status: "error", products: [], pagination: null });
      }
    }).catch(() => {
      if (active) setState({ status: "error", products: [], pagination: null });
    });
    return () => { active = false; };
  }, [page, retryKey]);

  const changePage = (nextPage) => {
    if (nextPage < 1 || (state.pagination && nextPage > state.pagination.pages)) return;
    setState((current) => ({ ...current, status: "loading" }));
    setPage(nextPage);
  };

  return <div className="min-h-[70vh] bg-[#f8f7f2] px-4 py-7 text-[#173B2A] sm:px-6 sm:py-10 lg:px-8">
    <div className="mx-auto w-full max-w-7xl">
      <Link href="/market" data-bondhu-no-fly className="inline-flex min-h-11 max-w-[250px] items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#247A4B] hover:bg-[#eaf2e7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B]"><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="max-w-[190px] leading-5 sm:max-w-none">{text.marketLink}</span></Link>
      <header className="mt-4 rounded-3xl border border-[#e7ddca] bg-[#eee7d8] p-5 sm:p-8 lg:p-10">
        <p className="text-xs font-bold tracking-[0.16em] text-[#9a6226]">{text.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{text.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526761] sm:text-base sm:leading-7">{text.intro}</p>
        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-[#d7d0bd] bg-white/75 p-3 text-xs leading-5 text-[#526761] sm:text-sm"><Store className="mt-0.5 h-4 w-4 shrink-0 text-[#247A4B]" aria-hidden="true" /><span>{text.source}</span></p>
      </header>

      <section className="mt-6" aria-label={text.browseLabel} aria-live="polite">
        {state.status === "loading" ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={text.load}>{Array.from({ length: 6 }, (_, index) => <div key={index} className="min-h-64 animate-pulse rounded-2xl border border-[#e5dfd1] bg-white p-5"><div className="h-12 w-12 rounded-2xl bg-[#eaf2e7]" /><div className="mt-5 h-5 w-2/3 rounded bg-[#efeee7]" /><div className="mt-4 h-16 rounded-xl bg-[#f5f4ed]" /><div className="mt-4 h-4 w-full rounded bg-[#efeee7]" /></div>)}</div> : null}
        {state.status === "error" ? <div data-bondhu-no-fly className="rounded-2xl border border-red-200 bg-white p-6 text-center" role="alert"><p className="font-bold text-[#173B2A]">{text.errorTitle}</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#62736A]">{text.error}</p><button type="button" onClick={() => { setState((current) => ({ ...current, status: "loading" })); setRetryKey((value) => value + 1); }} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white hover:bg-[#1c633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B]"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.retry}</button></div> : null}
        {state.status === "ready" && state.products.length === 0 ? <div data-bondhu-no-fly className="rounded-2xl border border-dashed border-[#d7d0bd] bg-white p-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><Store className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-bold">{text.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[#62736A]">{text.empty}</p></div> : null}
        {state.status === "ready" && state.products.length > 0 ? <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.products.map((product) => <ProductCard key={product._id} product={product} text={text} locale={locale} />)}</div>
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label={bn ? "পণ্যের পৃষ্ঠা" : "Product pages"}>
            <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbd7c8] bg-white px-4 text-sm font-semibold text-[#247A4B] disabled:cursor-not-allowed disabled:opacity-45"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.previous}</button>
            <span className="px-2 text-sm font-medium text-[#526761]">{text.page} {formatPrice(page, locale)} {text.of} {formatPrice(Math.max(state.pagination?.pages || 1, 1), locale)}</span>
            <button type="button" onClick={() => changePage(page + 1)} disabled={page >= (state.pagination?.pages || 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbd7c8] bg-white px-4 text-sm font-semibold text-[#247A4B] disabled:cursor-not-allowed disabled:opacity-45">{text.next}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          </nav>
        </> : null}
      </section>
    </div>
  </div>;
}
