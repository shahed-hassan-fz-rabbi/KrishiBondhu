"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Archive, Check, Leaf, MapPin, Pencil, Plus, RefreshCw, Store, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { buildMarketplaceListingEditPatch, validateMarketplaceListingEdit } from "@/lib/marketplaceListingEdit.js";
import { archiveMarketplaceProduct, fetchMyMarketplaceProducts, updateMarketplaceProduct, updateMarketplaceProductStatus } from "@/services/api.js";

const PAGE_SIZE = 20;
const MINIMUM_QUANTITY_BY_UNIT = { kg: 25, quintal: 0.25, ton: 0.025 };
const TEXT = {
  en: {
    eyebrow: "FARMER MARKETPLACE", title: "My listings", intro: "Review the products you have shared on the public Marketplace.", priceNote: "Your asking price is set by you. It is not a government-verified DAM market price.", loadingAuth: "Checking your sign-in…", guestTitle: "Sign in to view your listings", guestBody: "Your Marketplace listings are available after you sign in as a farmer.", login: "Sign in", restrictedTitle: "Farmer access required", restrictedBody: "Only farmer accounts can view their Marketplace listings.", load: "Loading your listings…", errorTitle: "Your listings could not be loaded", errorBody: "Check your connection or sign-in session, then try again.", retry: "Try again", expiredTitle: "Your session has expired", expiredBody: "Sign in again to view your private listing dashboard.", forbiddenTitle: "Access denied", forbiddenBody: "The server did not authorize access to farmer listings.", emptyTitle: "No listings yet", emptyBody: "Products you publish will appear here, including sold-out and archived listings.", sell: "Sell your crop", back: "Browse Marketplace", asking: "Farmer asking price", notDam: "Not a DAM-verified price", quantity: "Quantity", location: "Pickup area", created: "Listed", description: "Description", previous: "Previous", next: "Next", page: "Page", of: "of", unit: { kg: "kg", quintal: "quintal", ton: "ton" }, status: { active: "Active — বিক্রি চলছে", sold_out: "Sold Out — বিক্রি শেষ", archived: "Archived — সরানো হয়েছে" }, invalidDate: "Date unavailable", bdt: "BDT", edit: "Edit price & quantity", save: "Save changes", saving: "Saving…", cancel: "Cancel", priceField: "Asking price per unit (BDT)", quantityField: "Available quantity", saved: "Changes confirmed by the server.", noChanges: "Change the price or quantity before saving.", errors: { askingPricePerUnit: "Enter a finite amount from BDT 0.01 to 9,007,199,254,740,991.", quantity: "Quantity must be at least 25 kg in the selected unit.", invalid: "Check the price and quantity, then try again.", unauthorized: "Your sign-in session expired. Sign in again before saving.", forbidden: "Your account is not allowed to edit this listing.", notFound: "This listing is no longer available to edit.", network: "Could not reach the server. Check your connection and try again.", generic: "The listing could not be updated. Please try again." }
  },
  bn: {
    eyebrow: "কৃষক মার্কেটপ্লেস", title: "আমার পণ্যের তালিকা", intro: "প্রকাশ্য মার্কেটপ্লেসে আপনার দেওয়া পণ্যগুলো দেখুন।", priceNote: "দাম আপনি নির্ধারণ করেছেন। এটি সরকারি যাচাইকৃত DAM বাজারদর নয়।", loadingAuth: "আপনার সাইন-ইন যাচাই হচ্ছে…", guestTitle: "আপনার তালিকা দেখতে সাইন ইন করুন", guestBody: "কৃষক হিসেবে সাইন-ইন করলে আপনার মার্কেটপ্লেসের পণ্যগুলো দেখা যাবে।", login: "সাইন ইন", restrictedTitle: "কৃষক অ্যাকাউন্ট প্রয়োজন", restrictedBody: "শুধু কৃষক অ্যাকাউন্ট থেকে নিজের মার্কেটপ্লেসের তালিকা দেখা যায়।", load: "আপনার পণ্যের তালিকা লোড হচ্ছে…", errorTitle: "আপনার পণ্যের তালিকা আনা যায়নি", errorBody: "ইন্টারনেট বা সাইন-ইন সেশন দেখে আবার চেষ্টা করুন।", retry: "আবার চেষ্টা করুন", expiredTitle: "আপনার সেশনের মেয়াদ শেষ হয়েছে", expiredBody: "ব্যক্তিগত তালিকা দেখতে আবার সাইন ইন করুন।", forbiddenTitle: "প্রবেশের অনুমতি নেই", forbiddenBody: "সার্ভার কৃষকের পণ্যের তালিকা দেখার অনুমতি দেয়নি।", emptyTitle: "এখনো কোনো পণ্য নেই", emptyBody: "প্রকাশ করা পণ্য এখানে দেখা যাবে; বিক্রি শেষ ও সরানো তালিকাও থাকবে।", sell: "আপনার ফসল বিক্রি করুন", back: "মার্কেটপ্লেস দেখুন", asking: "কৃষকের চাওয়া দাম", notDam: "DAM-যাচাইকৃত দাম নয়", quantity: "পরিমাণ", location: "পণ্য নেওয়ার এলাকা", created: "তালিকাভুক্ত", description: "বর্ণনা", previous: "আগের পৃষ্ঠা", next: "পরের পৃষ্ঠা", page: "পৃষ্ঠা", of: "এর মধ্যে", unit: { kg: "কেজি", quintal: "কুইন্টাল", ton: "টন" }, status: { active: "Active — বিক্রি চলছে", sold_out: "Sold Out — বিক্রি শেষ", archived: "Archived — সরানো হয়েছে" }, invalidDate: "তারিখ পাওয়া যায়নি", bdt: "BDT", edit: "দাম ও পরিমাণ সম্পাদনা", save: "সংরক্ষণ করুন", saving: "সংরক্ষণ হচ্ছে…", cancel: "বাতিল", priceField: "প্রতি এককের চাওয়া দাম (BDT)", quantityField: "পণ্যের পরিমাণ", saved: "সার্ভার পরিবর্তন নিশ্চিত করেছে।", noChanges: "সংরক্ষণের আগে দাম বা পরিমাণ পরিবর্তন করুন।", errors: { askingPricePerUnit: "০.০১ থেকে ৯,০০৭,১৯৯,২৫৪,৭৪০,৯৯১ BDT-এর মধ্যে সঠিক দাম লিখুন।", quantity: "নির্বাচিত এককে কমপক্ষে ২৫ কেজি পণ্য রাখতে হবে।", invalid: "দাম ও পরিমাণ যাচাই করে আবার চেষ্টা করুন।", unauthorized: "আপনার সাইন-ইন সেশনের মেয়াদ শেষ। সংরক্ষণের আগে আবার সাইন ইন করুন।", forbidden: "আপনার অ্যাকাউন্ট থেকে এই তালিকা সম্পাদনা করা যাবে না।", notFound: "এই তালিকাটি আর সম্পাদনার জন্য পাওয়া যাচ্ছে না।", network: "সার্ভারে সংযোগ করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।", generic: "তালিকাটি হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।" }
  },
};

const ACTION_TEXT = {
  en: {
    soldOut: "Mark sold out", available: "Make available again", archive: "Archive listing", updating: "Updating…", archiving: "Archiving…",
    archiveTitle: "Archive this listing?", archiveBody: "Archiving removes this listing from public Marketplace browsing. You cannot undo this from the current dashboard.", confirmArchive: "Archive listing", statusUpdated: "Listing availability updated.", archivedSuccess: "Listing archived and removed from public browsing.",
    errors: { badRequest: "The server rejected this action. Refresh the listing and try again.", unauthorized: "Your sign-in session expired. Sign in again before changing this listing.", forbidden: "Your account is not allowed to manage this listing.", notFound: "This listing is no longer available to manage.", network: "Could not reach the server. Check your connection and try again.", generic: "The listing could not be updated. Please try again." },
  },
  bn: {
    soldOut: "বিক্রি শেষ করুন", available: "আবার বিক্রির জন্য দিন", archive: "তালিকা সরান", updating: "হালনাগাদ হচ্ছে…", archiving: "সরানো হচ্ছে…",
    archiveTitle: "এই তালিকাটি সরাবেন?", archiveBody: "তালিকাটি সরালে প্রকাশ্য মার্কেটপ্লেসে আর দেখা যাবে না। বর্তমান ড্যাশবোর্ড থেকে এটি ফেরানো যাবে না।", confirmArchive: "তালিকা সরান", statusUpdated: "পণ্যের বিক্রির অবস্থা হালনাগাদ হয়েছে।", archivedSuccess: "তালিকাটি সরানো হয়েছে এবং প্রকাশ্য মার্কেটপ্লেস থেকে বাদ গেছে।",
    errors: { badRequest: "সার্ভার এই কাজটি গ্রহণ করেনি। তালিকাটি রিফ্রেশ করে আবার চেষ্টা করুন।", unauthorized: "আপনার সাইন-ইন সেশনের মেয়াদ শেষ। তালিকা পরিবর্তনের আগে আবার সাইন ইন করুন।", forbidden: "আপনার অ্যাকাউন্ট থেকে এই তালিকা পরিচালনা করা যাবে না।", notFound: "এই তালিকাটি আর পরিচালনার জন্য পাওয়া যাচ্ছে না।", network: "সার্ভারে সংযোগ করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।", generic: "তালিকাটি হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।" },
  },
};

function number(value, locale) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(parsed) : "—";
}

function date(value, locale, fallback) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function ListingCard({ product, text, locale, onEdit, editing, draft, errors, feedback, saving, onDraftChange, onSave, onCancel, onStatusChange, onArchive, management }) {
  const status = ["active", "sold_out", "archived"].includes(product?.status) ? product.status : "archived";
  const statusStyle = status === "active" ? "border-green-200 bg-green-50 text-green-800" : status === "sold_out" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-stone-300 bg-stone-100 text-stone-700";
  const unit = text.unit[product?.unit] || product?.unit || "—";
  return <article className="flex min-w-0 flex-col rounded-2xl border border-[#e5dfd1] bg-white p-4 shadow-sm sm:p-5">
    {product?.productImageDataUrl ? <div className="relative mb-4 h-40 overflow-hidden rounded-xl bg-[#edf2e8]">
      <Image src={product.productImageDataUrl} alt={product?.productName || text.title} fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
    </div> : null}
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><Leaf className="h-5 w-5" aria-hidden="true" /></span>
      <span data-bondhu-no-fly className={`max-w-[75%] break-words rounded-full border px-3 py-1 text-xs font-bold leading-5 ${statusStyle}`}>{text.status[status]}</span>
    </div>
    <h2 className="mt-4 break-words text-lg font-bold leading-snug text-[#173B2A]">{product?.productName || "—"}</h2>
    <div className="mt-3 rounded-xl bg-[#f5f4ed] p-3">
      <p className="text-xs font-semibold text-[#526761]">{text.asking} · {text.notDam}</p>
      <p className="mt-1 break-words text-xl font-extrabold text-[#247A4B]">{text.bdt} {number(product?.askingPricePerUnit, locale)} <span className="text-sm font-semibold">/ {unit}</span></p>
    </div>
    <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs text-[#68776e]">{text.quantity}</dt><dd className="mt-0.5 break-words font-semibold text-[#274638]">{number(product?.quantity, locale)} {unit}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-[#68776e]">{text.location}</dt><dd className="mt-0.5 flex min-w-0 items-start gap-1 font-semibold text-[#274638]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#247A4B]" aria-hidden="true" /><span className="break-words">{[product?.upazila, product?.district].filter(Boolean).join(", ") || "—"}</span></dd></div>
      <div><dt className="text-xs text-[#68776e]">{text.created}</dt><dd className="mt-0.5 font-semibold text-[#274638]">{date(product?.createdAt, locale, text.invalidDate)}</dd></div>
    </dl>
    {product?.description ? <div className="mt-4 border-t border-[#eee9dc] pt-3"><p className="text-xs font-semibold text-[#68776e]">{text.description}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#526761]">{product.description}</p></div> : null}
    {status !== "archived" && !editing ? <button type="button" data-bondhu-no-fly disabled={management?.busy || saving} onClick={() => onEdit(product)} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-[#b9cfba] px-4 text-sm font-bold text-[#247A4B] hover:bg-[#edf4e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B] disabled:cursor-wait disabled:opacity-60"><Pencil className="h-4 w-4" aria-hidden="true" />{text.edit}</button> : null}
    {status !== "archived" && !editing ? <div data-bondhu-no-fly className="mt-3 flex flex-wrap gap-2" aria-busy={management?.id === product?._id && management.busy}>
      <button type="button" disabled={management?.busy || saving} onClick={() => onStatusChange(product, status === "active" ? "sold_out" : "active")} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#247A4B] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{management?.id === product?._id && management.kind === "status" ? text.updating : status === "active" ? text.soldOut : text.available}</button>
      <button type="button" disabled={management?.busy || saving} onClick={() => onArchive(product)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8b8aa] px-4 text-sm font-semibold text-[#8a3d2c] hover:bg-[#fff6f2] disabled:cursor-wait disabled:opacity-60"><Archive className="h-4 w-4" aria-hidden="true" />{management?.id === product?._id && management.kind === "archive" ? text.archiving : text.archive}</button>
    </div> : null}
    {editing ? <form data-bondhu-no-fly onSubmit={onSave} className="mt-4 space-y-3 border-t border-[#eee9dc] pt-4" aria-label={text.edit}>
      {[{ name: "askingPricePerUnit", label: text.priceField }, { name: "quantity", label: text.quantityField }].map(({ name, label }) => {
        const id = `marketplace-edit-${name}-${String(product?._id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        return <div key={name}><label htmlFor={id} className="mb-1 block text-sm font-semibold text-[#274638]">{label}</label><input id={id} name={name} type="number" inputMode="decimal" min={name === "quantity" ? (MINIMUM_QUANTITY_BY_UNIT[product.unit] || 25) : "0.01"} max={Number.MAX_SAFE_INTEGER} step="any" value={draft[name]} onChange={(event) => onDraftChange(name, event.target.value)} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${id}-error` : undefined} className="min-h-11 w-full rounded-xl border border-[#cbd7c8] bg-white px-3 text-sm text-[#173B2A] focus:border-[#247A4B] focus:outline-none focus:ring-2 focus:ring-[#247A4B]/20" />{errors[name] ? <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700">{errors[name]}</p> : null}</div>;
      })}
      <div className="flex flex-wrap gap-2"><button data-bondhu-no-fly type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#247A4B] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"><Check className="h-4 w-4" aria-hidden="true" />{saving ? text.saving : text.save}</button><button data-bondhu-no-fly type="button" disabled={saving} onClick={onCancel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#cbd7c8] px-4 text-sm font-semibold text-[#526761] disabled:opacity-60"><X className="h-4 w-4" aria-hidden="true" />{text.cancel}</button></div>
    </form> : null}
    {feedback ? <p role={feedback.type === "error" ? "alert" : "status"} className={`mt-3 text-sm font-medium ${feedback.type === "error" ? "text-red-700" : "text-[#247A4B]"}`}>{feedback.message}</p> : null}
  </article>;
}

export default function MarketplaceMyListings() {
  const { user, isLoading: authLoading } = useAuth();
  const { locale } = useLang();
  const language = locale === "bn" ? "bn" : "en";
  const baseText = TEXT[language];
  const actionText = ACTION_TEXT[language];
  const text = { ...baseText, ...actionText, errors: { ...baseText.errors, ...actionText.errors } };
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState({ status: "loading", page: null, products: [], pagination: null });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ askingPricePerUnit: "", quantity: "" });
  const [editErrors, setEditErrors] = useState({});
  const [editFeedback, setEditFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [managementAction, setManagementAction] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const requestId = useRef(0);
  const editInFlight = useRef(false);
  const managementInFlight = useRef(false);
  const archiveDialogRef = useRef(null);

  useEffect(() => {
    const dialog = archiveDialogRef.current;
    if (archiveTarget && dialog && !dialog.open) dialog.showModal();
    else if (!archiveTarget && dialog?.open) dialog.close();
  }, [archiveTarget]);

  useEffect(() => {
    if (authLoading || user?.role !== "farmer") return undefined;
    const currentRequest = ++requestId.current;
    fetchMyMarketplaceProducts({ page, limit: PAGE_SIZE }).then((response) => {
      if (currentRequest !== requestId.current) return;
      if (response.status === 401) {
        setState({ status: "unauthorized", page, products: [], pagination: null });
      } else if (response.status === 403) {
        setState({ status: "forbidden", page, products: [], pagination: null });
      } else if (response.success && Array.isArray(response.data?.products)) {
        setState({ status: "ready", page, products: response.data.products, pagination: response.data.pagination || { page, limit: PAGE_SIZE, total: response.data.products.length, pages: 1 } });
      } else {
        setState({ status: "error", page, products: [], pagination: null });
      }
    }).catch(() => {
      if (currentRequest === requestId.current) setState({ status: "error", page, products: [], pagination: null });
    });
    return () => { requestId.current += 1; };
  }, [authLoading, user?.role, page, retryKey]);

  const visibleStatus = state.page === page ? state.status : "loading";
  const retry = () => { setState({ status: "loading", page, products: [], pagination: null }); setRetryKey((value) => value + 1); };
  const replaceProduct = (productId, updatedProduct) => setState((current) => ({ ...current, products: current.products.map((item) => item._id === productId ? updatedProduct : item) }));
  const actionError = (response) => ({ 400: text.errors.badRequest, 401: text.errors.unauthorized, 403: text.errors.forbidden, 404: text.errors.notFound }[response.status] || text.errors.generic);
  const updateStatus = async (product, nextStatus) => {
    if (managementInFlight.current || editInFlight.current || isSaving || editingId || !["active", "sold_out"].includes(product?.status) || !["active", "sold_out"].includes(nextStatus)) return;
    managementInFlight.current = true;
    setManagementAction({ id: product._id, kind: "status", busy: true });
    setEditFeedback(null);
    try {
      const response = await updateMarketplaceProductStatus(product._id, nextStatus);
      if (response.success && response.data?.product?.status === nextStatus) {
        replaceProduct(product._id, response.data.product);
        setEditFeedback({ id: product._id, type: "success", message: text.statusUpdated });
      } else setEditFeedback({ id: product._id, type: "error", message: response.status === 0 ? text.errors.network : actionError(response) });
    } catch {
      setEditFeedback({ id: product._id, type: "error", message: text.errors.network });
    } finally {
      managementInFlight.current = false;
      setManagementAction(null);
    }
  };
  const confirmArchive = async () => {
    if (managementInFlight.current || editInFlight.current || isSaving || editingId || !archiveTarget || archiveTarget.status === "archived") return;
    const target = archiveTarget;
    managementInFlight.current = true;
    setManagementAction({ id: target._id, kind: "archive", busy: true });
    setEditFeedback(null);
    try {
      const response = await archiveMarketplaceProduct(target._id);
      if (response.success && response.data?.product?.status === "archived") {
        replaceProduct(target._id, response.data.product);
        setArchiveTarget(null);
        setEditFeedback({ id: target._id, type: "success", message: text.archivedSuccess });
      } else setEditFeedback({ id: target._id, type: "error", message: response.status === 0 ? text.errors.network : actionError(response) });
    } catch {
      setEditFeedback({ id: target._id, type: "error", message: text.errors.network });
    } finally {
      managementInFlight.current = false;
      setManagementAction(null);
    }
  };
  const startEdit = (product) => {
    if (!product || !["active", "sold_out"].includes(product.status) || isSaving || managementInFlight.current) return;
    setEditingId(product._id);
    setEditDraft({ askingPricePerUnit: String(product.askingPricePerUnit ?? ""), quantity: String(product.quantity ?? "") });
    setEditErrors({});
    setEditFeedback(null);
  };
  const cancelEdit = () => { if (editInFlight.current) return; setEditingId(null); setEditErrors({}); setEditFeedback(null); };
  const saveEdit = async (event) => {
    event.preventDefault();
    if (editInFlight.current || managementInFlight.current || !editingId) return;
    const product = state.products.find((item) => item._id === editingId);
    if (!product || !["active", "sold_out"].includes(product.status)) return;
    const errors = validateMarketplaceListingEdit(editDraft, text.errors, product.unit);
    setEditErrors(errors);
    if (Object.keys(errors).length) return;
    const patch = buildMarketplaceListingEditPatch(editDraft, product);
    if (!Object.keys(patch).length) { setEditFeedback({ id: editingId, type: "info", message: text.noChanges }); return; }
    editInFlight.current = true;
    setIsSaving(true);
    setEditFeedback(null);
    try {
      const response = await updateMarketplaceProduct(editingId, patch);
      if (response.success && response.data?.product) {
        const updatedProduct = response.data.product;
        setState((current) => ({ ...current, products: current.products.map((item) => item._id === editingId ? updatedProduct : item) }));
        setEditingId(null);
        setEditFeedback({ id: editingId, type: "success", message: text.saved });
        setEditErrors({});
      } else {
        const messages = { 400: text.errors.invalid, 401: text.errors.unauthorized, 403: text.errors.forbidden, 404: text.errors.notFound };
        setEditFeedback({ id: editingId, type: "error", message: messages[response.status] || text.errors.generic });
      }
    } catch {
      setEditFeedback({ id: editingId, type: "error", message: text.errors.network });
    } finally {
      editInFlight.current = false;
      setIsSaving(false);
    }
  };
  const accessPanel = (title, body, action = null) => <section data-bondhu-no-fly className="mx-auto max-w-xl rounded-3xl border border-[#e5dfd1] bg-white p-6 text-center shadow-sm sm:p-9"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><Store className="h-7 w-7" aria-hidden="true" /></span><h1 className="mt-4 text-2xl font-bold text-[#173B2A]">{title}</h1><p className="mt-2 text-sm leading-6 text-[#62736A]">{body}</p>{action}</section>;

  if (authLoading) return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><p role="status" className="rounded-2xl bg-white p-6 text-center text-sm font-medium text-[#526761]">{text.loadingAuth}</p></div>;
  if (!user) return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{accessPanel(text.guestTitle, text.guestBody, <Link data-bondhu-no-fly href="/login?redirect=%2Fmarketplace%2Fmy-listings" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white hover:bg-[#1c633d]">{text.login}</Link>)}<div className="mt-5 text-center"><Link href="/marketplace" className="text-sm font-semibold text-[#247A4B]">← {text.back}</Link></div></div>;
  if (user.role !== "farmer") return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{accessPanel(text.restrictedTitle, text.restrictedBody)}<div className="mt-5 text-center"><Link href="/marketplace" className="text-sm font-semibold text-[#247A4B]">← {text.back}</Link></div></div>;

  const pages = Math.max(Number(state.pagination?.pages) || 0, 1);
  return <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <header className="mb-6 flex min-w-0 flex-col gap-4 rounded-3xl border border-[#e5dfd1] bg-gradient-to-br from-[#f7f5eb] to-[#edf4e9] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#65796b]">{text.eyebrow}</p><h1 className="mt-2 break-words text-2xl font-extrabold text-[#173B2A] sm:text-3xl">{text.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#526761]">{text.intro}</p><p className="mt-3 max-w-2xl text-xs font-medium leading-5 text-[#68776e]">{text.priceNote}</p></div>
      <Link data-bondhu-no-fly href="/marketplace/sell" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white hover:bg-[#1c633d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B]"><Plus className="h-4 w-4" aria-hidden="true" />{text.sell}</Link>
    </header>
    <div className="mt-40 mb-5 sm:mt-5"><Link data-bondhu-no-fly href="/marketplace" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#247A4B] hover:bg-[#edf4e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.back}</Link></div>

    {visibleStatus === "loading" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={text.load}>{Array.from({ length: 3 }, (_, index) => <div key={index} className="min-h-64 animate-pulse rounded-2xl border border-[#e5dfd1] bg-white p-5"><div className="h-10 w-10 rounded-xl bg-[#eaf2e7]" /><div className="mt-5 h-5 w-2/3 rounded bg-[#efeee7]" /><div className="mt-4 h-16 rounded-xl bg-[#f5f4ed]" /><div className="mt-4 h-4 rounded bg-[#efeee7]" /></div>)}</div> : null}
    {visibleStatus === "error" ? <section data-bondhu-no-fly className="rounded-2xl border border-red-200 bg-white p-6 text-center" role="alert"><h2 className="font-bold text-[#173B2A]">{text.errorTitle}</h2><p className="mt-2 text-sm text-[#62736A]">{text.errorBody}</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.retry}</button></section> : null}
    {visibleStatus === "unauthorized" ? accessPanel(text.expiredTitle, text.expiredBody, <Link href="/login?redirect=%2Fmarketplace%2Fmy-listings" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#247A4B] px-5 text-sm font-bold text-white">{text.login}</Link>) : null}
    {visibleStatus === "forbidden" ? accessPanel(text.forbiddenTitle, text.forbiddenBody) : null}
    {visibleStatus === "ready" && state.products.length === 0 ? <section data-bondhu-no-fly className="rounded-2xl border border-dashed border-[#d7d0bd] bg-white p-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf2e7] text-[#247A4B]"><Store className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-bold text-[#173B2A]">{text.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[#62736A]">{text.emptyBody}</p><Link href="/marketplace/sell" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b9cfba] px-5 text-sm font-bold text-[#247A4B]"><Plus className="h-4 w-4" aria-hidden="true" />{text.sell}</Link></section> : null}
    {visibleStatus === "ready" && state.products.length > 0 ? <>
      <section aria-label={text.title} aria-live="polite" className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{state.products.map((product) => <ListingCard key={product._id} product={product} text={text} locale={locale} editing={editingId === product._id} draft={editDraft} errors={editErrors} feedback={editFeedback?.id === product._id ? editFeedback : null} saving={isSaving && editingId === product._id} onEdit={startEdit} onDraftChange={(name, value) => setEditDraft((current) => ({ ...current, [name]: value }))} onSave={saveEdit} onCancel={cancelEdit} onStatusChange={updateStatus} onArchive={setArchiveTarget} management={managementAction || { busy: isSaving || Boolean(editingId) }} />)}</section>
      <dialog ref={archiveDialogRef} aria-labelledby="marketplace-archive-title" aria-describedby="marketplace-archive-description" onCancel={(event) => { event.preventDefault(); if (!managementInFlight.current) setArchiveTarget(null); }} className="w-[min(92vw,30rem)] rounded-3xl border border-[#e5dfd1] bg-white p-0 text-[#173B2A] shadow-2xl backdrop:bg-[#14281f]/55">
        {archiveTarget ? <div data-bondhu-no-fly className="p-6 sm:p-7"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e9] text-[#8a3d2c]"><Archive className="h-6 w-6" aria-hidden="true" /></div><h2 id="marketplace-archive-title" className="mt-4 text-xl font-bold">{text.archiveTitle}</h2><p id="marketplace-archive-description" className="mt-2 text-sm leading-6 text-[#526761]">{text.archiveBody}</p><p className="mt-3 break-words rounded-xl bg-[#f5f4ed] p-3 text-sm font-semibold">{archiveTarget.productName}</p>{editFeedback?.id === archiveTarget._id && editFeedback.type === "error" ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{editFeedback.message}</p> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" autoFocus disabled={Boolean(managementAction?.busy)} onClick={() => setArchiveTarget(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cbd7c8] px-4 text-sm font-semibold text-[#526761] disabled:opacity-60">{text.cancel}</button><button type="button" disabled={Boolean(managementAction?.busy)} onClick={confirmArchive} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#8a3d2c] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{managementAction?.kind === "archive" ? text.archiving : text.confirmArchive}</button></div></div> : null}
      </dialog>
      <nav data-bondhu-no-fly className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label={locale === "bn" ? "আমার পণ্যের পৃষ্ঠা" : "My listing pages"}>
        <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || visibleStatus !== "ready" || Boolean(editingId) || isSaving || Boolean(managementAction)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbd7c8] bg-white px-4 text-sm font-semibold text-[#247A4B] disabled:cursor-not-allowed disabled:opacity-45"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.previous}</button>
        <span className="px-2 text-sm font-medium text-[#526761]">{text.page} {number(page, locale)} {text.of} {number(pages, locale)}</span>
        <button type="button" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || visibleStatus !== "ready" || Boolean(editingId) || isSaving || Boolean(managementAction)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cbd7c8] bg-white px-4 text-sm font-semibold text-[#247A4B] disabled:cursor-not-allowed disabled:opacity-45">{text.next}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      </nav>
    </> : null}
  </div>;
}
