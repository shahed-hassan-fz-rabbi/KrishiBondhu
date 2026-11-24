"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ImagePlus, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { createMarketplaceProduct } from "@/services/api.js";

const INITIAL_FORM = { productName: "", description: "", quantity: "", unit: "kg", askingPricePerUnit: "", district: "", upazila: "" };
const UNITS = ["kg", "quintal", "ton"];

const MAX_IMAGE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_OUTPUT_BYTES = 100_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TEXT = {
  en: {
    title: "Sell your crop", intro: "Create a public listing for produce you have available.", priceNotice: "Your asking price is set by you. It is not a government-verified DAM market price.", loading: "Checking your sign-in…", guestTitle: "Sign in to list your produce", guestBody: "Only signed-in farmers can create Marketplace listings. You can continue browsing without an account.", login: "Login to continue", register: "Create an account", restrictedTitle: "Farmer access required", restricted: "Product listings can only be created by farmer accounts. This action is also checked by the server.", back: "Back to Marketplace", fields: { productName: "Product or crop name", productImageDataUrl: "Product photo (optional)", description: "Description (optional)", quantity: "Available quantity", unit: "Unit", askingPricePerUnit: "Your price per unit (BDT)", district: "District", upazila: "Upazila" }, placeholders: { productName: "For example, potato", description: "Quality, harvest timing, or pickup details", quantity: "Enter quantity", askingPricePerUnit: "Enter your asking price", district: "Enter district", upazila: "Enter upazila" }, unitNames: { kg: "Kilograms (kg)", quintal: "Quintal", ton: "Ton" }, minimumQuantity: "Minimum quantity: 0.01 in the selected unit.", imageChoose: "Choose a photo", imageHint: "JPG, PNG, or WebP · up to 12 MB. The photo is resized before upload.", imageProcessing: "Preparing photo…", imageRemove: "Remove photo", imageError: "Could not prepare this photo. Use a JPG, PNG, or WebP image up to 12 MB.", submit: "Publish listing", submitting: "Publishing…", successTitle: "Your listing was created", successBody: "The server confirmed that your product listing is now available on the Marketplace.", createAnother: "Create another listing", genericError: "We could not create your listing. Please try again.", sessionError: "Your sign-in session is missing or expired. Sign in again to publish this listing.", forbidden: "Your account is not allowed to create farmer listings.", serverError: "Please review the marked fields and try again.", errors: { productName: "Enter a product name from 2 to 100 characters.", productImageDataUrl: "The photo could not be stored. Choose a smaller JPG, PNG, or WebP image.", description: "Description must be 2,000 characters or fewer.", quantity: "Enter a valid quantity of at least 0.01 in the selected unit.", unit: "Choose kg, quintal, or ton.", askingPricePerUnit: "Enter a valid price of at least BDT 0.01.", district: "Enter a district name from 2 to 80 characters.", upazila: "Enter an upazila name from 2 to 80 characters." }
  },
  bn: {
    title: "আপনার ফসল বিক্রি করুন", intro: "আপনার কাছে থাকা কৃষিপণ্যের জন্য একটি প্রকাশ্য তালিকা তৈরি করুন।", priceNotice: "দাম আপনি নির্ধারণ করবেন। এটি সরকারি যাচাইকৃত DAM বাজারদর নয়।", loading: "আপনার সাইন-ইন যাচাই হচ্ছে…", guestTitle: "পণ্য তালিকাভুক্ত করতে সাইন ইন করুন", guestBody: "শুধু সাইন-ইন করা কৃষক মার্কেটপ্লেসে পণ্য দিতে পারবেন। অ্যাকাউন্ট ছাড়াও পণ্য দেখা যাবে।", login: "সাইন ইন করুন", register: "অ্যাকাউন্ট তৈরি করুন", restrictedTitle: "কৃষক অ্যাকাউন্ট প্রয়োজন", restricted: "শুধু কৃষক অ্যাকাউন্ট থেকে পণ্যের তালিকা তৈরি করা যায়। সার্ভারেও এই অনুমতি যাচাই করা হয়।", back: "মার্কেটপ্লেসে ফিরে যান", fields: { productName: "পণ্য বা ফসলের নাম", productImageDataUrl: "পণ্যের ছবি (ঐচ্ছিক)", description: "বর্ণনা (ঐচ্ছিক)", quantity: "পণ্যের পরিমাণ", unit: "একক", askingPricePerUnit: "প্রতি এককের চাওয়া দাম (BDT)", district: "জেলা", upazila: "উপজেলা" }, placeholders: { productName: "যেমন: আলু", description: "মান, সংগ্রহের সময় বা নেওয়ার তথ্য", quantity: "পরিমাণ লিখুন", askingPricePerUnit: "আপনার চাওয়া দাম লিখুন", district: "জেলা লিখুন", upazila: "উপজেলা লিখুন" }, unitNames: { kg: "কিলোগ্রাম (kg)", quintal: "কুইন্টাল", ton: "টন" }, minimumQuantity: "নির্বাচিত এককে কমপক্ষে ০.০১ পরিমাণ লিখুন।", imageChoose: "ছবি নির্বাচন করুন", imageHint: "JPG, PNG বা WebP · সর্বোচ্চ ১২ MB। আপলোডের আগে ছবি ছোট করা হবে।", imageProcessing: "ছবি প্রস্তুত হচ্ছে…", imageRemove: "ছবি সরান", imageError: "ছবি প্রস্তুত করা যায়নি। ১২ MB-এর মধ্যে JPG, PNG বা WebP ছবি দিন।", submit: "পণ্যের তালিকা প্রকাশ করুন", submitting: "প্রকাশ হচ্ছে…", successTitle: "আপনার পণ্যের তালিকা তৈরি হয়েছে", successBody: "সার্ভার নিশ্চিত করেছে যে আপনার পণ্যটি এখন মার্কেটপ্লেসে দেখা যাবে।", createAnother: "আরেকটি পণ্য দিন", genericError: "পণ্যের তালিকা তৈরি করা যায়নি। আবার চেষ্টা করুন।", sessionError: "আপনার সাইন-ইন সেশন নেই বা মেয়াদ শেষ হয়েছে। তালিকা প্রকাশ করতে আবার সাইন ইন করুন।", forbidden: "আপনার অ্যাকাউন্ট থেকে কৃষকের পণ্য তালিকা তৈরি করা যাবে না।", serverError: "চিহ্নিত তথ্যগুলো দেখে আবার চেষ্টা করুন।", errors: { productName: "পণ্যের নাম ২ থেকে ১০০ অক্ষরের মধ্যে লিখুন।", productImageDataUrl: "ছবিটি সংরক্ষণ করা যায়নি। ছোট JPG, PNG বা WebP ছবি নির্বাচন করুন।", description: "বর্ণনা সর্বোচ্চ ২,০০০ অক্ষরের হতে পারবে।", quantity: "নির্বাচিত এককে কমপক্ষে ০.০১ পরিমাণ লিখুন।", unit: "kg, quintal বা ton নির্বাচন করুন।", askingPricePerUnit: "কমপক্ষে ০.০১ BDT দাম লিখুন।", district: "জেলার নাম ২ থেকে ৮০ অক্ষরের মধ্যে লিখুন।", upazila: "উপজেলার নাম ২ থেকে ৮০ অক্ষরের মধ্যে লিখুন।" }
  },
};

async function prepareProductImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error("unsupported image type");
  if (!file.size || file.size > MAX_IMAGE_FILE_BYTES) throw new Error("image too large");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    let scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    let blob = null;
    for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (blob?.size <= MAX_IMAGE_OUTPUT_BYTES) break;
      }
      if (blob?.size <= MAX_IMAGE_OUTPUT_BYTES) break;
      scale *= 0.82;
    }
    if (!blob || blob.size > MAX_IMAGE_OUTPUT_BYTES || !["image/webp", "image/jpeg", "image/png"].includes(blob.type)) throw new Error("could not optimize image");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("could not read image"));
      reader.onerror = () => reject(new Error("could not read image"));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function validate(form, text) {
  const errors = {};
  const name = form.productName.trim();
  const district = form.district.trim();
  const upazila = form.upazila.trim();
  const quantity = Number(form.quantity);
  const price = Number(form.askingPricePerUnit);
  if (name.length < 2 || name.length > 100) errors.productName = text.errors.productName;
  if (form.description.length > 2000) errors.description = text.errors.description;
  if (form.productImageDataUrl.length > 140_000) errors.productImageDataUrl = text.errors.productImageDataUrl;
  if (!form.quantity.trim() || !Number.isFinite(quantity) || quantity < 0.01 || quantity > Number.MAX_SAFE_INTEGER) errors.quantity = text.errors.quantity;
  if (!UNITS.includes(form.unit)) errors.unit = text.errors.unit;
  if (!form.askingPricePerUnit.trim() || !Number.isFinite(price) || price < 0.01 || price > Number.MAX_SAFE_INTEGER) errors.askingPricePerUnit = text.errors.askingPricePerUnit;
  if (district.length < 2 || district.length > 80) errors.district = text.errors.district;
  if (upazila.length < 2 || upazila.length > 80) errors.upazila = text.errors.upazila;
  return errors;
}

function errorMessages(result, text) {
  if (result.status === 401) return { summary: text.sessionError, requiresLogin: true };
  if (result.status === 403) return { summary: text.forbidden };
  const fieldErrors = {};
  for (const detail of result.error?.details || []) {
    if (detail?.field && text.errors[detail.field]) fieldErrors[detail.field] = text.errors[detail.field];
  }
  return { summary: result.status === 400 ? text.serverError : (result.error?.message || text.genericError), fieldErrors };
}

function Field({ name, label, error, children }) {
  const errorId = `${name}-error`;
  return <div className="min-w-0"><label htmlFor={name} className="mb-1.5 block text-sm font-semibold text-[#274638]">{label}</label>{children}{error ? <p id={errorId} className="mt-1 text-sm leading-5 text-red-700" role="alert">{error}</p> : null}</div>;
}

export default function MarketplaceSellForm() {
  const { user, isLoading } = useAuth();
  const { locale } = useLang();
  const bn = locale === "bn";
  const text = TEXT[bn ? "bn" : "en"];
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const inFlight = useRef(false);
  const pageRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("kb-marketplace-sell-page-mounted");
    return () => root.classList.remove("kb-marketplace-sell-page-mounted");
  }, []);

  useEffect(() => {
    const pageElement = pageRef.current;
    if (!pageElement || typeof IntersectionObserver === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => {
      root.classList.toggle("kb-marketplace-sell-page-visible", entry.isIntersecting);
    });
    observer.observe(pageElement);
    return () => {
      observer.disconnect();
      root.classList.remove("kb-marketplace-sell-page-visible");
    };
  }, [user?.role]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setNotice("");
    setSuccess(false);
  };

  const selectProductImage = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setErrors((current) => ({ ...current, productImageDataUrl: undefined }));
    setNotice("");
    setIsImageProcessing(true);
    try {
      const productImageDataUrl = await prepareProductImage(file);
      setForm((current) => ({ ...current, productImageDataUrl }));
    } catch {
      setErrors((current) => ({ ...current, productImageDataUrl: text.imageError }));
    } finally {
      setIsImageProcessing(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current || isImageProcessing || user?.role !== "farmer") return;
    const validation = validate(form, text);
    setErrors(validation);
    setNotice("");
    setSuccess(false);
    if (Object.keys(validation).length) return;

    inFlight.current = true;
    setIsSubmitting(true);
    const permittedFields = {
      productName: form.productName.trim(),
      productImageDataUrl: form.productImageDataUrl,
      description: form.description.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      askingPricePerUnit: Number(form.askingPricePerUnit),
      district: form.district.trim(),
      upazila: form.upazila.trim(),
    };
    try {
      const result = await createMarketplaceProduct(permittedFields);
      if (result.status === 401 || result.status === 403) {
        const response = errorMessages(result, text);
        setNotice(response.summary);
        if (response.requiresLogin) setErrors((current) => ({ ...current, requiresLogin: true }));
      } else if (result.success && result.data?.product) {
        setSuccess(true);
        setForm(INITIAL_FORM);
      } else {
        const response = errorMessages(result, text);
        setErrors((current) => ({ ...current, ...response.fieldErrors }));
        setNotice(response.summary);
      }
    } catch (error) {
      setNotice(error?.message || text.genericError);
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const inputClass = "min-h-12 w-full min-w-0 rounded-xl border border-[#cbd7c8] bg-white px-3 py-2 text-base font-normal text-[#173B2A] placeholder:text-[#78857d] focus:border-[#247A4B] focus:outline-2 focus:outline-offset-1 focus:outline-[#247A4B]";
  const fieldErrorProps = (name) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

  return <div ref={pageRef} data-bondhu-no-fly className="mx-auto w-full max-w-6xl px-4 py-7 text-[#173B2A] sm:px-6 sm:py-10">
    <Link href="/marketplace" data-bondhu-no-fly className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#247A4B] hover:bg-[#eaf2e7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{text.back}</Link>
    <header className="mt-4 rounded-3xl border border-[#e7ddca] bg-[#eee7d8] p-5 sm:p-8">
      <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-[#9a6226]"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{bn ? "কৃষক মার্কেটপ্লেস" : "FARMER MARKETPLACE"}</p>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{text.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526761] sm:text-base">{text.intro}</p>
      <p className="mt-4 rounded-2xl border border-[#ddcfb2] bg-white/75 p-3 text-sm leading-6 text-[#526761]">{text.priceNotice}</p>
    </header>

    {isLoading ? <p role="status" className="mt-6 rounded-2xl border border-[#e5dfd1] bg-white p-5 text-sm text-[#526761]">{text.loading}</p> : !user ? <section className="mt-6 rounded-2xl border border-[#e5dfd1] bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">{text.guestTitle}</h2><p className="mt-2 text-sm leading-6 text-[#526761]">{text.guestBody}</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/login?redirect=%2Fmarketplace%2Fsell" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#247A4B] px-5 text-sm font-bold text-white hover:bg-[#1c633d]">{text.login}</Link><Link href="/register?redirect=%2Fmarketplace%2Fsell" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#cbd7c8] px-5 text-sm font-semibold text-[#247A4B]">{text.register}</Link></div></section> : user.role !== "farmer" ? <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">{text.restrictedTitle}</h2><p className="mt-2 text-sm leading-6 text-[#526761]">{text.restricted}</p></section> : success ? <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8" role="status"><CheckCircle2 className="h-10 w-10 text-[#247A4B]" aria-hidden="true" /><h2 className="mt-3 text-xl font-bold">{text.successTitle}</h2><p className="mt-2 text-sm leading-6 text-[#526761]">{text.successBody}</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/marketplace" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#247A4B] px-5 text-sm font-bold text-white">{text.back}</Link><button type="button" onClick={() => setSuccess(false)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cbd7c8] px-5 text-sm font-semibold text-[#247A4B]">{text.createAnother}</button></div></section> : <form onSubmit={submit} noValidate data-bondhu-no-fly className="mt-6 grid min-w-0 gap-4 rounded-2xl border border-[#e5dfd1] bg-white p-4 shadow-sm sm:grid-cols-2 sm:gap-5 sm:p-6">
      {notice ? <div className="sm:col-span-2" role="alert"><p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{notice}</p>{errors.requiresLogin ? <Link href="/login?redirect=%2Fmarketplace%2Fsell" className="mt-2 inline-block text-sm font-semibold text-[#247A4B] underline">{text.login}</Link> : null}</div> : null}
      <Field name="productName" label={text.fields.productName} error={errors.productName}><input id="productName" name="productName" value={form.productName} onChange={updateField} maxLength={100} required autoComplete="off" placeholder={text.placeholders.productName} className={inputClass} {...fieldErrorProps("productName")} /></Field>
      <Field name="quantity" label={text.fields.quantity} error={errors.quantity}><input id="quantity" name="quantity" type="number" inputMode="decimal" min="0.01" max={Number.MAX_SAFE_INTEGER} step="any" value={form.quantity} onChange={updateField} required placeholder={text.placeholders.quantity} className={inputClass} {...fieldErrorProps("quantity")} /><p className="mt-1.5 text-xs text-[#68776e]">{text.minimumQuantity}</p></Field>
      <Field name="unit" label={text.fields.unit} error={errors.unit}><select id="unit" name="unit" value={form.unit} onChange={updateField} required className={inputClass} {...fieldErrorProps("unit")}>{UNITS.map((unit) => <option key={unit} value={unit}>{text.unitNames[unit]}</option>)}</select></Field>
      <Field name="askingPricePerUnit" label={text.fields.askingPricePerUnit} error={errors.askingPricePerUnit}><input id="askingPricePerUnit" name="askingPricePerUnit" type="number" inputMode="decimal" min="0.01" max={Number.MAX_SAFE_INTEGER} step="any" value={form.askingPricePerUnit} onChange={updateField} required placeholder={text.placeholders.askingPricePerUnit} className={inputClass} {...fieldErrorProps("askingPricePerUnit")} /></Field>
      <Field name="district" label={text.fields.district} error={errors.district}><input id="district" name="district" value={form.district} onChange={updateField} minLength={2} maxLength={80} required autoComplete="address-level2" placeholder={text.placeholders.district} className={inputClass} {...fieldErrorProps("district")} /></Field>
      <Field name="upazila" label={text.fields.upazila} error={errors.upazila}><input id="upazila" name="upazila" value={form.upazila} onChange={updateField} minLength={2} maxLength={80} required placeholder={text.placeholders.upazila} className={inputClass} {...fieldErrorProps("upazila")} /></Field>
      <Field name="description" label={text.fields.description} error={errors.description}><textarea id="description" name="description" value={form.description} onChange={updateField} maxLength={2000} rows={4} placeholder={text.placeholders.description} className={`${inputClass} resize-y`} {...fieldErrorProps("description")} /></Field>
      <div className="flex flex-col justify-end gap-3 sm:col-span-2 sm:flex-row sm:items-center"><p className="mr-auto text-xs leading-5 text-[#68776e]">{text.priceNotice}</p><button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#247A4B] px-6 text-sm font-bold text-white hover:bg-[#1c633d] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#247A4B] sm:w-auto">{isSubmitting ? text.submitting : text.submit}</button></div>
    </form>}
  </div>;
}
