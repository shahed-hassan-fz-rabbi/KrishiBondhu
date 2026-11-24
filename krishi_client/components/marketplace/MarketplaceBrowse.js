"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Carrot,
  Check,
  CheckCircle2,
  Leaf,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Store,
  Wheat,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { createMarketplaceOrder, fetchMarketplaceProducts, fetchMyMarketplaceOrders } from "@/services/api.js";

const PAGE_SIZE = 12;
const copy = {
  en: {
    eyebrow: "FARMER MARKETPLACE",
    title: "Good harvests, closer to home.",
    intro: "Explore crops and produce listed by farmers across Bangladesh, with the asking price, available quantity, and pickup area shown up front.",
    priceType: "Farmer asking price",
    notDam: "Not a DAM-verified price",
    per: "per",
    quantity: "Available quantity",
    location: "Pickup area",
    demo: "DEMO / SAMPLE",
    demoNote: "Fictional sample listing and price",
    emptyTitle: "No active listings yet",
    empty: "There are no farmer listings to show right now. Please check again later.",
    filteredEmptyTitle: "No products found",
    filteredEmpty: "No products found. Try another crop or district.",
    load: "Loading farmer listings…",
    errorTitle: "Marketplace is temporarily unavailable",
    error: "We could not load the public listings. Check your connection and retry.",
    retry: "Try again",
    previous: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    marketLink: "See verified market information",
    sell: "Sell your crop",
    noDescription: "No description provided.",
    bdt: "BDT",
    unit: { kg: "kg", quintal: "quintal", ton: "ton" },
    browseLabel: "Browse public farmer listings",
    searchLabel: "Search crop or product",
    searchPlaceholder: "For example, potato or আলু",
    districtLabel: "District (enter as listed)",
    districtPlaceholder: "Enter district name",
    districtHint: "Enter the district name as used in the listing; names are not automatically translated.",
    search: "Search listings",
    clear: "Clear filters",
    validation: "Search must be 100 characters or fewer and district 80 characters or fewer.",
    source: "Listings are provided by farmers; details should be confirmed with the seller before making arrangements.",
    available: "Available listings",
    browseTitle: "Find produce for your needs",
    browseIntro: "Search by crop and narrow the list by district.",
    productFallback: "Farm produce",
    listing: "Marketplace listing",
    emptyAction: "Clear search filters",
    demoDetail: "Sample only — not a real farmer offer",
    buyNow: "Buy now",
    buyTitle: "Send a buy request",
    buyIntro: "We save your request and show the farmer's contact so you can arrange the purchase directly. No payment is collected here.",
    buyQuantity: "Quantity to buy",
    buyConfirm: "Confirm buy request",
    buyCancel: "Cancel",
    buyBusy: "Saving…",
    buySuccess: "Buy request saved",
    buyContact: "Farmer contact",
    buyNoPayment: "No payment is collected in the app. Confirm price and pickup directly with the farmer.",
    buyNeedLogin: "Sign in to send a buy request",
    buyNeedPhone: "Verify your phone number in Settings before buying.",
    buyError: "Could not save your request. Please try again.",
    myOrders: "My buy requests",
    ordersTitle: "Your buy requests",
    ordersEmpty: "You have not sent any buy requests yet.",
    noContact: "Contact not available",
  },
  bn: {
    eyebrow: "কৃষক মার্কেটপ্লেস",
    title: "ভালো ফসল, আপনার কাছাকাছি।",
    intro: "বাংলাদেশের কৃষকদের তালিকাভুক্ত ফসল ও পণ্য দেখুন। শুরুতেই চাওয়া দাম, পণ্যের পরিমাণ ও সংগ্রহের এলাকা জেনে নিন।",
    priceType: "কৃষকের চাওয়া দাম",
    notDam: "DAM-যাচাইকৃত দাম নয়",
    per: "প্রতি",
    quantity: "পণ্যের পরিমাণ",
    location: "সংগ্রহের এলাকা",
    demo: "ডেমো / নমুনা",
    demoNote: "কাল্পনিক নমুনা পণ্য ও দাম",
    emptyTitle: "এখনো কোনো পণ্য তালিকাভুক্ত নেই",
    empty: "এই মুহূর্তে দেখানোর মতো কৃষকের পণ্য নেই। পরে আবার দেখুন।",
    filteredEmptyTitle: "কোনো পণ্য পাওয়া যায়নি",
    filteredEmpty: "কোনো পণ্য পাওয়া যায়নি। অন্য ফসল বা জেলার নাম দিয়ে চেষ্টা করুন।",
    load: "কৃষকের পণ্যের তালিকা লোড হচ্ছে…",
    errorTitle: "মার্কেটপ্লেস সাময়িকভাবে পাওয়া যাচ্ছে না",
    error: "পণ্যের তালিকা আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    previous: "আগের পৃষ্ঠা",
    next: "পরের পৃষ্ঠা",
    page: "পৃষ্ঠা",
    of: "এর মধ্যে",
    marketLink: "যাচাইকৃত বাজারের তথ্য দেখুন",
    sell: "আপনার ফসল বিক্রি করুন",
    noDescription: "কোনো বিবরণ দেওয়া হয়নি।",
    bdt: "টাকা (BDT)",
    unit: { kg: "কেজি", quintal: "কুইন্টাল", ton: "টন" },
    browseLabel: "কৃষকের পণ্য দেখুন",
    searchLabel: "ফসল বা পণ্যের নাম খুঁজুন",
    searchPlaceholder: "যেমন: আলু বা potato",
    districtLabel: "জেলা (তালিকায় যেভাবে আছে)",
    districtPlaceholder: "জেলার নাম লিখুন",
    districtHint: "তালিকায় ব্যবহৃত জেলার নাম লিখুন; নাম স্বয়ংক্রিয়ভাবে অনুবাদ হবে না।",
    search: "পণ্য খুঁজুন",
    clear: "ফিল্টার মুছুন",
    validation: "ফসলের নাম ১০০ অক্ষর এবং জেলার নাম ৮০ অক্ষরের মধ্যে লিখুন।",
    source: "তালিকাগুলো কৃষকের দেওয়া। কেনার আগে বিক্রেতার সঙ্গে পণ্যের তথ্য ও শর্ত যাচাই করুন।",
    available: "পণ্যের তালিকা",
    browseTitle: "আপনার প্রয়োজনের পণ্য খুঁজুন",
    browseIntro: "ফসলের নাম লিখুন এবং জেলা দিয়ে তালিকা ছোট করুন।",
    productFallback: "কৃষিপণ্য",
    listing: "মার্কেটপ্লেসের তালিকা",
    emptyAction: "সার্চ ফিল্টার মুছুন",
    demoDetail: "শুধু নমুনা — প্রকৃত কৃষকের পণ্য নয়",
    buyNow: "এখন কিনুন",
    buyTitle: "কেনার অনুরোধ পাঠান",
    buyIntro: "আপনার অনুরোধ সংরক্ষণ করে কৃষকের যোগাযোগের তথ্য দেখাই, যাতে আপনি সরাসরি কেনার ব্যবস্থা করতে পারেন। এখানে কোনো টাকা নেওয়া হয় না।",
    buyQuantity: "কত পরিমাণ কিনবেন",
    buyConfirm: "কেনার অনুরোধ নিশ্চিত করুন",
    buyCancel: "বাতিল",
    buyBusy: "সংরক্ষণ হচ্ছে…",
    buySuccess: "কেনার অনুরোধ সংরক্ষিত",
    buyContact: "কৃষকের যোগাযোগ",
    buyNoPayment: "অ্যাপে কোনো টাকা নেওয়া হয় না। দাম ও পণ্য নেওয়ার ব্যবস্থা সরাসরি কৃষকের সঙ্গে নিশ্চিত করুন।",
    buyNeedLogin: "কেনার অনুরোধ পাঠাতে সাইন ইন করুন",
    buyNeedPhone: "কেনার আগে Settings-এ ফোন নম্বর যাচাই করুন।",
    buyError: "অনুরোধ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
    myOrders: "আমার কেনার অনুরোধ",
    ordersTitle: "আপনার কেনার অনুরোধ",
    ordersEmpty: "আপনি এখনো কোনো কেনার অনুরোধ পাঠাননি।",
    noContact: "যোগাযোগের তথ্য পাওয়া যায়নি",
  },
};

function isDemoListing(product) {
  return /demo\s*\/\s*sample/i.test(`${product?.productName || ""} ${product?.description || ""}`);
}

function formatPrice(value, locale) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(Number(value));
}

function artworkFor(productName = "") {
  const name = productName.toLocaleLowerCase();
  if (/rice|dhan|grain|wheat|চাল|ধান|গম/.test(name)) {
    return { Icon: Wheat, style: "from-[#f3ead2] via-[#eee3c4] to-[#e4d4ad]", ink: "text-[#9a7028]" };
  }
  if (/potato|tomato|eggplant|chilli|chili|onion|cucumber|pumpkin|okra|আলু|টমেটো|বেগুন|মরিচ|পেঁয়াজ|শসা|কুমড়া/.test(name)) {
    return { Icon: Carrot, style: "from-[#e7f0df] via-[#dcebd8] to-[#cfe4d1]", ink: "text-[#398052]" };
  }
  return { Icon: Sprout, style: "from-[#e8eee1] via-[#dce8d9] to-[#c9dfd1]", ink: "text-[#398052]" };
}

function ProductCard({ product, text, locale, onBuy }) {
  const demo = isDemoListing(product);
  const art = artworkFor(product.productName);
  return <article data-bondhu-no-fly className="group flex min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-[#e4e1d5] bg-white shadow-[0_5px_18px_rgba(31,59,42,.045)] transition duration-200 hover:-translate-y-1 hover:border-[#bdd2be] hover:shadow-[0_18px_36px_rgba(31,59,42,.11)]">
    <div className={`relative isolate grid h-44 place-items-center overflow-hidden ${product.productImageDataUrl ? "bg-[#edf2e8]" : `bg-gradient-to-br ${art.style}`}`}>
      {product.productImageDataUrl ? <Image src={product.productImageDataUrl} alt={product.productName || text.productFallback} fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <>
        <div aria-hidden="true" className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(51,86,54,.19) 1px, transparent 0)", backgroundSize: "19px 19px" }} />
        <div aria-hidden="true" className="absolute -right-5 -top-10 h-36 w-36 rounded-full border border-white/60" />
        <div aria-hidden="true" className="absolute -bottom-20 -left-8 h-40 w-40 rounded-full border border-white/55" />
        <span className={`relative grid h-[5.2rem] w-[5.2rem] place-items-center rounded-[1.75rem] border border-white/75 bg-white/75 shadow-[0_12px_24px_rgba(38,65,42,.10)] backdrop-blur-sm ${art.ink}`}>
          <art.Icon className="h-11 w-11 stroke-[1.45] transition-transform duration-300 group-hover:scale-105" aria-hidden="true" />
        </span>
      </>}
      <span className={`absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[.14em] ${product.productImageDataUrl ? "rounded-full bg-black/55 px-2.5 py-1 text-white" : "text-[#48624e]/75"}`}>{text.listing}</span>
      {demo ? <span className="absolute right-3 top-3 rounded-full border border-amber-300/90 bg-[#fff8e5]/95 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-amber-900 shadow-sm">{text.demo}</span> : null}
    </div>

    <div className="flex flex-1 flex-col p-4 sm:p-5">
      <div className="flex min-h-[3.5rem] items-start justify-between gap-3">
        <h2 className="break-words text-lg font-extrabold leading-snug tracking-[-.02em] text-[#173b2a]">{product.productName || text.productFallback}</h2>
        <Leaf className="mt-1 h-4 w-4 shrink-0 text-[#71a17b]" aria-hidden="true" />
      </div>

      <div className="mt-3 rounded-2xl border border-[#e7eadf] bg-[#f7f8f2] p-3.5">
        <p className="text-[11px] font-semibold text-[#62736a]">{text.priceType} <span className="font-normal">· {text.notDam}</span></p>
        <p className="mt-1 break-words text-[1.35rem] font-black leading-tight tracking-[-.035em] text-[#207348]">{text.bdt} {formatPrice(product.askingPricePerUnit, locale)} <span className="text-sm font-bold tracking-normal text-[#496254]">/ {text.unit[product.unit] || product.unit}</span></p>
        {demo ? <p className="mt-2 border-t border-amber-200 pt-2 text-[11px] font-semibold leading-4 text-amber-900">{text.demoNote}<span className="block font-normal">{text.demoDetail}</span></p> : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-b border-[#eeede6] pb-4">
        <div className="min-w-0"><dt className="text-[11px] font-medium text-[#758179]">{text.quantity}</dt><dd className="mt-1 break-words text-sm font-bold text-[#284638]">{formatPrice(product.quantity, locale)} {text.unit[product.unit] || product.unit}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] font-medium text-[#758179]">{text.location}</dt><dd className="mt-1 flex min-w-0 items-start gap-1.5 break-words text-sm font-bold text-[#284638]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#49845d]" aria-hidden="true" /><span className="break-words">{[product.upazila, product.district].filter(Boolean).join(", ")}</span></dd></div>
      </dl>
      <p className="mt-3 min-h-[3.75rem] break-words text-sm leading-5 text-[#68766e] line-clamp-3">{product.description || text.noDescription}</p>
      <button type="button" data-bondhu-no-fly disabled={demo} onClick={() => onBuy?.(product)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#247A4B] px-4 text-sm font-extrabold text-white transition hover:bg-[#1b633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B] disabled:cursor-not-allowed disabled:opacity-45"><ShoppingBag className="h-4 w-4" aria-hidden="true" />{text.buyNow}</button>
    </div>
  </article>;
}

function ProductSkeleton({ label }) {
  return <div className="min-h-[430px] animate-pulse overflow-hidden rounded-[1.4rem] border border-[#e4e1d5] bg-white" aria-hidden="true">
    <div className="grid h-36 place-items-center bg-gradient-to-br from-[#edf2e8] to-[#dae9dc]"><span className="h-16 w-16 rounded-[1.5rem] bg-white/70" /></div>
    <div className="p-5"><div className="h-5 w-2/3 rounded bg-[#e9eee4]" /><div className="mt-5 h-24 rounded-2xl bg-[#f3f5ee]" /><div className="mt-5 grid grid-cols-2 gap-4"><span className="h-10 rounded bg-[#eef1e9]" /><span className="h-10 rounded bg-[#eef1e9]" /></div><div className="mt-5 h-4 w-full rounded bg-[#eef1e9]" /></div>
    <span className="sr-only">{label}</span>
  </div>;
}

export default function MarketplaceBrowse() {
  const { locale } = useLang();
  const { user } = useAuth();
  const bn = locale === "bn";
  const text = copy[bn ? "bn" : "en"];
  const buyDialogRef = useRef(null);
  const [buyTarget, setBuyTarget] = useState(null);
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyResult, setBuyResult] = useState(null);
  const [buyError, setBuyError] = useState("");
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", district: "" });
  const [appliedFilters, setAppliedFilters] = useState({ q: "", district: "" });
  const [validationError, setValidationError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState({ status: "loading", products: [], pagination: null });

  useEffect(() => {
    let active = true;
    fetchMarketplaceProducts({ page, limit: PAGE_SIZE, ...appliedFilters }).then((response) => {
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
  }, [page, retryKey, appliedFilters]);

  useEffect(() => {
    const dialog = buyDialogRef.current;
    if ((buyTarget || ordersOpen) && dialog && !dialog.open) dialog.showModal();
    else if (!buyTarget && !ordersOpen && dialog?.open) dialog.close();
  }, [buyTarget, ordersOpen]);

  const openBuy = (product) => {
    setBuyTarget(product);
    setBuyQuantity(String(product.quantity && product.quantity < 1 ? product.quantity : 1));
    setBuyResult(null);
    setBuyError("");
  };

  const closeBuy = () => {
    if (buyBusy) return;
    setBuyTarget(null);
    setOrdersOpen(false);
    setBuyResult(null);
    setBuyError("");
  };

  const confirmBuy = async (event) => {
    event.preventDefault();
    if (!buyTarget || buyBusy) return;
    if (!user) { setBuyError(text.buyNeedLogin); return; }
    const quantity = Number(buyQuantity);
    if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > Number(buyTarget.quantity)) {
      setBuyError(text.buyError);
      return;
    }
    setBuyBusy(true);
    setBuyError("");
    setBuyResult(null);
    try {
      const result = await createMarketplaceOrder(buyTarget._id, quantity);
      if (result.success) setBuyResult(result.data);
      else if (result.status === 401) setBuyError(text.buyNeedLogin);
      else if (result.status === 403 && result.error?.code === "PHONE_NOT_VERIFIED") setBuyError(text.buyNeedPhone);
      else setBuyError(result.error?.message || text.buyError);
    } catch {
      setBuyError(text.buyError);
    } finally {
      setBuyBusy(false);
    }
  };

  const openOrders = async () => {
    setOrdersOpen(true);
    setBuyResult(null);
    setBuyError(user ? "" : text.buyNeedLogin);
    if (!user) { setOrders([]); return; }
    setOrdersLoading(true);
    try {
      const result = await fetchMyMarketplaceOrders();
      if (result.success) setOrders(result.data?.orders || []);
      else setBuyError(result.error?.message || text.buyError);
    } catch {
      setBuyError(text.buyError);
    } finally {
      setOrdersLoading(false);
    }
  };

  const submitFilters = (event) => {
    event.preventDefault();
    const next = { q: draft.q.trim(), district: draft.district.trim() };
    if (next.q.length > 100 || next.district.length > 80) {
      setValidationError(text.validation);
      return;
    }
    setValidationError("");
    if (next.q === appliedFilters.q && next.district === appliedFilters.district && page === 1) return;
    setState((current) => ({ ...current, status: "loading" }));
    setPage(1);
    setAppliedFilters(next);
  };

  const clearFilters = () => {
    setDraft({ q: "", district: "" });
    setValidationError("");
    setState((current) => ({ ...current, status: "loading" }));
    setPage(1);
    setAppliedFilters({ q: "", district: "" });
  };

  const changePage = (nextPage) => {
    if (nextPage < 1 || (state.pagination && nextPage > state.pagination.pages)) return;
    setState((current) => ({ ...current, status: "loading" }));
    setPage(nextPage);
  };

  const totalListings = state.status === "ready" && Number.isFinite(state.pagination?.total)
    ? formatPrice(state.pagination.total, locale)
    : null;

  return <div className="min-h-[70vh] bg-[#f7f7f1] px-3 py-5 text-[#173b2a] sm:px-5 sm:py-7 lg:px-7">
    <div className="mx-auto w-full max-w-7xl">
      <div data-bondhu-no-fly className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/market" data-bondhu-no-fly className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-[#247a4b] transition hover:bg-[#e9f0e5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247a4b]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span>{text.marketLink}</span></Link>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-bondhu-no-fly onClick={openOrders} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#247a4b] bg-white px-5 text-sm font-bold text-[#247a4b] transition hover:bg-[#eef4ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247a4b]"><ShoppingBag className="h-4 w-4" aria-hidden="true" />{text.myOrders}</button>
          <Link href="/marketplace/sell" data-bondhu-no-fly className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#247a4b] bg-[#247a4b] px-5 text-sm font-bold text-white shadow-[0_7px_16px_rgba(36,122,75,.18)] transition hover:-translate-y-0.5 hover:bg-[#1b633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247a4b]"><Store className="h-4 w-4" aria-hidden="true" />{text.sell}</Link>
        </div>
      </div>

      <header className="relative isolate grid min-w-0 overflow-hidden rounded-[1.75rem] border border-[#d7dfcb] bg-[linear-gradient(118deg,#eaf0e2_0%,#eff1e5_48%,#f4ebd7_100%)] shadow-[0_12px_32px_rgba(46,71,46,.055)]">
        <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(46,92,58,.16) 1px, transparent 0)", backgroundSize: "23px 23px", maskImage: "linear-gradient(90deg,black,transparent 90%)" }} />
        <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#bdd1b8] bg-white/65 px-3 py-1.5 text-[10px] font-extrabold tracking-[.16em] text-[#46744e] sm:text-xs"><Sprout className="h-4 w-4" aria-hidden="true" />{text.eyebrow}</p>
          <h1 className="mt-5 max-w-3xl break-words text-[2.2rem] font-black leading-[1.1] tracking-[-.055em] text-[#153b29] sm:text-5xl lg:text-[3.55rem]">{text.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#53685a] sm:text-base sm:leading-7">{text.intro}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/marketplace/sell" data-bondhu-no-fly className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#247a4b] px-5 text-sm font-extrabold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#1b633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174f34]"><Store className="h-4 w-4" aria-hidden="true" />{text.sell}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            {totalListings !== null ? <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c8d5bd] bg-white/55 px-3 text-xs font-semibold text-[#53685a]"><Check className="h-4 w-4 text-[#247a4b]" aria-hidden="true" />{totalListings} {text.available}</span> : null}
          </div>
        </div>
      </header>

      <section className="mt-7" aria-labelledby="marketplace-search-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
          <div className="max-w-[calc(100%-8rem)] sm:max-w-none"><h2 id="marketplace-search-title" className="text-xl font-extrabold tracking-[-.03em] text-[#183d2b] sm:text-2xl">{text.browseTitle}</h2><p className="mt-1 text-sm leading-5 text-[#68766e]">{text.browseIntro}</p></div>
          <span className="hidden items-center gap-1.5 pb-1 text-xs font-semibold text-[#718077] sm:inline-flex"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />{text.browseLabel}</span>
        </div>
        <form data-bondhu-no-fly onSubmit={submitFilters} className="grid min-w-0 gap-3 rounded-[1.4rem] border border-[#e2e4da] bg-white p-3 shadow-[0_9px_25px_rgba(31,59,42,.06)] sm:p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)_auto] lg:items-end" aria-label={bn ? "পণ্য খুঁজুন ও ফিল্টার করুন" : "Search and filter products"}>
          <label className="block min-w-0 text-xs font-bold text-[#344f3f] sm:text-sm">{text.searchLabel}
            <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718077]" aria-hidden="true" /><input data-bondhu-no-fly type="search" name="q" value={draft.q} maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))} placeholder={text.searchPlaceholder} className="min-h-12 w-full min-w-0 rounded-xl border border-[#d8dfd3] bg-[#fbfcf9] py-2 pl-11 pr-3 text-base font-normal text-[#173b2a] placeholder:text-[#89948c] focus:border-[#438558] focus:bg-white focus:outline-2 focus:outline-offset-1 focus:outline-[#438558]" />
            </span>
          </label>
          <label className="block min-w-0 text-xs font-bold text-[#344f3f] sm:text-sm">{text.districtLabel}
            <input data-bondhu-no-fly type="text" name="district" value={draft.district} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, district: event.target.value }))} placeholder={text.districtPlaceholder} aria-describedby="marketplace-district-hint" className="mt-1.5 min-h-12 w-full min-w-0 rounded-xl border border-[#d8dfd3] bg-[#fbfcf9] px-3.5 py-2 text-base font-normal text-[#173b2a] placeholder:text-[#89948c] focus:border-[#438558] focus:bg-white focus:outline-2 focus:outline-offset-1 focus:outline-[#438558]" />
            <span id="marketplace-district-hint" className="mt-1 block text-[11px] font-normal leading-4 text-[#748178]">{text.districtHint}</span>
          </label>
          <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
            <button type="submit" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#247a4b] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#1b633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174f34] sm:flex-none"><Search className="h-4 w-4" aria-hidden="true" />{text.search}</button>
            <button type="button" onClick={clearFilters} disabled={!draft.q && !draft.district && !appliedFilters.q && !appliedFilters.district} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#d8dfd3] bg-white px-4 text-sm font-bold text-[#326d48] transition hover:bg-[#f4f7f0] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#438558] sm:flex-none"><X className="h-4 w-4" aria-hidden="true" />{text.clear}</button>
          </div>
          {validationError ? <p className="text-sm font-semibold text-red-700 lg:col-span-3" role="alert">{validationError}</p> : null}
        </form>
      </section>

      <section className="mt-6" aria-label={text.browseLabel} aria-live="polite">
        {state.status === "loading" ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={text.load}>{Array.from({ length: 6 }, (_, index) => <ProductSkeleton key={index} label={text.load} />)}</div> : null}
        {state.status === "error" ? <div data-bondhu-no-fly className="rounded-[1.5rem] border border-red-200 bg-white px-6 py-9 text-center shadow-sm" role="alert"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700"><RefreshCw className="h-6 w-6" aria-hidden="true" /></span><p className="mt-4 text-lg font-extrabold text-[#173b2a]">{text.errorTitle}</p><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#62736a]">{text.error}</p><button type="button" onClick={() => { setState((current) => ({ ...current, status: "loading" })); setRetryKey((value) => value + 1); }} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#247a4b] px-5 text-sm font-extrabold text-white transition hover:bg-[#1b633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174f34]"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.retry}</button></div> : null}
        {state.status === "ready" && state.products.length === 0 ? <div data-bondhu-no-fly className="rounded-[1.5rem] border border-dashed border-[#cfd9c8] bg-white px-6 py-10 text-center shadow-sm sm:py-14"><span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.3rem] bg-[#edf3e8] text-[#35794b]"><Store className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-xl font-extrabold tracking-[-.025em] text-[#173b2a]">{appliedFilters.q || appliedFilters.district ? text.filteredEmptyTitle : text.emptyTitle}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#68766e]">{appliedFilters.q || appliedFilters.district ? text.filteredEmpty : text.empty}</p>{(appliedFilters.q || appliedFilters.district) ? <button type="button" onClick={clearFilters} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c8d7c5] px-4 text-sm font-bold text-[#2e7146] hover:bg-[#f4f7f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#438558]"><X className="h-4 w-4" aria-hidden="true" />{text.emptyAction}</button> : null}</div> : null}
        {state.status === "ready" && state.products.length > 0 ? <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.products.map((product) => <ProductCard key={product._id} product={product} text={text} locale={locale} onBuy={openBuy} />)}</div>
          <nav className="mt-7 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[#e2e4da] bg-white px-3 py-3 shadow-sm" aria-label={bn ? "পণ্যের পৃষ্ঠা" : "Product pages"}>
            <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8dfd3] bg-white px-4 text-sm font-bold text-[#326d48] transition hover:bg-[#f4f7f0] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#438558]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.previous}</button>
            <span className="px-2 text-sm font-bold text-[#52675a]">{text.page} {formatPrice(page, locale)} {text.of} {formatPrice(Math.max(state.pagination?.pages || 1, 1), locale)}</span>
            <button type="button" onClick={() => changePage(page + 1)} disabled={page >= (state.pagination?.pages || 1)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d8dfd3] bg-white px-4 text-sm font-bold text-[#326d48] transition hover:bg-[#f4f7f0] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#438558]">{text.next}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          </nav>
        </> : null}
      </section>

      <aside className="mt-7 flex min-w-0 items-start gap-3 rounded-2xl border border-[#e3e3d8] bg-[#eff2e9] px-4 py-4 text-xs leading-5 text-[#58695b] sm:items-center sm:px-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#3c7b4f] shadow-sm"><Leaf className="h-4 w-4" aria-hidden="true" /></span><p>{text.source}</p></aside>

      <dialog ref={buyDialogRef} aria-labelledby="marketplace-buy-title" onCancel={(event) => { event.preventDefault(); closeBuy(); }} className="w-[min(94vw,32rem)] rounded-3xl border border-[#dfe6d8] bg-white p-0 text-[#173b2a] shadow-2xl backdrop:bg-[#14281f]/55">
        <div data-bondhu-no-fly className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="marketplace-buy-title" className="text-xl font-extrabold">{ordersOpen ? text.ordersTitle : text.buyTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-[#62736a]">{ordersOpen ? text.buyIntro : text.buyIntro}</p>
            </div>
            <button type="button" onClick={closeBuy} aria-label={text.buyCancel} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8dfd3] text-[#496254] hover:bg-[#f4f7f0]"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>

          {buyTarget && !ordersOpen ? <>
            <p className="mt-4 break-words rounded-xl bg-[#f5f4ed] p-3 text-sm font-semibold">{buyTarget.productName} · {text.bdt} {formatPrice(buyTarget.askingPricePerUnit, locale)}/{text.unit[buyTarget.unit] || buyTarget.unit}</p>
            <form onSubmit={confirmBuy} className="mt-4 space-y-3">
              <label htmlFor="marketplace-buy-quantity" className="block text-sm font-bold">{text.buyQuantity}</label>
              <input id="marketplace-buy-quantity" type="number" inputMode="decimal" min="0.01" max={buyTarget.quantity} step="any" value={buyQuantity} onChange={(event) => setBuyQuantity(event.target.value)} className="min-h-12 w-full rounded-xl border border-[#cbd7c8] bg-white px-3 text-base" />
              <button type="submit" disabled={buyBusy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#247A4B] px-4 text-sm font-extrabold text-white disabled:opacity-70">{buyBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}{buyBusy ? text.buyBusy : text.buyConfirm}</button>
            </form>
          </> : null}

          {buyResult ? <div role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />{text.buySuccess}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-900/70">{text.buyContact}</p>
            <p className="mt-1 break-words text-base font-bold text-[#173b2a]">{buyResult.farmerContact?.name || text.noContact}</p>
            {buyResult.farmerContact?.phone ? <a href={`tel:${buyResult.farmerContact.phone}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#247A4B] px-4 text-sm font-bold text-white"><Phone className="h-4 w-4" aria-hidden="true" />{buyResult.farmerContact.phone}</a> : <p className="mt-2 text-sm text-[#62736a]">{text.noContact}</p>}
            <p className="mt-3 text-xs leading-5 text-[#526761]">{text.buyNoPayment}</p>
          </div> : null}

          {ordersOpen && user ? <div className="mt-4 space-y-3">
            {ordersLoading ? <p role="status" className="text-sm text-[#62736a]">{text.load}</p> : null}
            {!ordersLoading && orders.length === 0 ? <p className="text-sm text-[#62736a]">{text.ordersEmpty}</p> : null}
            {!ordersLoading && orders.map((order) => <div key={order._id} className="rounded-xl border border-[#e2e4da] bg-[#fbfcf9] p-3">
              <p className="break-words text-sm font-bold">{order.productNameSnapshot}</p>
              <p className="mt-1 text-xs text-[#62736a]">{order.quantity} {text.unit[order.unitSnapshot] || order.unitSnapshot} · {text.bdt} {(order.subtotalPaisa / 100).toLocaleString(bn ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs font-semibold text-[#247A4B]">{text.buyContact}: {order.farmerContact?.name || text.noContact}{order.farmerContact?.phone ? ` · ${order.farmerContact.phone}` : ""}</p>
            </div>)}
          </div> : null}

          {buyError ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{buyError}{!user ? <Link href="/login?redirect=%2Fmarketplace" className="mt-2 block font-bold underline">{text.buyNeedLogin}</Link> : null}</div> : null}
        </div>
      </dialog>
    </div>
  </div>;
}
