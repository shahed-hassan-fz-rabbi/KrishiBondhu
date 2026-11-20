"use client";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { useState } from "react";
import { Bell, Check, Settings, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

function SettingsPage() {
  const { user, updateProfile, requestPhoneVerification, confirmPhoneVerification } = useAuth();
  const { locale } = useLang();
  const bn = locale === "bn";
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(Boolean(user?.smsAlertsEnabled && user?.phoneVerifiedAt));
  const [phone, setPhone] = useState(user?.phone || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const savePhone = async (event) => {
    event.preventDefault(); setSaving(true); setMessage("");
    const result = await updateProfile({ phone });
    if (result.success) { setPhone(result.user.phone); setEnabled(Boolean(result.user.smsAlertsEnabled)); setCodeSent(false); setVerificationCode(""); setMessage(bn ? "ফোন নম্বর সংরক্ষণ হয়েছে। SMS চালুর আগে নম্বর যাচাই করুন।" : "Phone number saved. Verify it before enabling SMS alerts."); }
    else setMessage(result.error || (bn ? "ফোন নম্বর সংরক্ষণ করা যায়নি।" : "Could not save phone number."));
    setSaving(false);
  };
  const sendVerificationCode = async () => {
    setSaving(true); setMessage("");
    const result = await requestPhoneVerification();
    if (result.success) { setCodeSent(true); setMessage(bn ? "৬ অঙ্কের কোড SMS-এ পাঠানো হয়েছে; ১০ মিনিটের মধ্যে দিন।" : "A six-digit code was sent by SMS; enter it within 10 minutes."); }
    else setMessage(result.error || (bn ? "যাচাই কোড পাঠানো যায়নি।" : "Could not send verification code."));
    setSaving(false);
  };
  const verifyPhone = async (event) => {
    event.preventDefault(); setSaving(true); setMessage("");
    const result = await confirmPhoneVerification(verificationCode);
    if (result.success) { setCodeSent(false); setVerificationCode(""); setMessage(bn ? "ফোন নম্বর যাচাই হয়েছে। এখন SMS অ্যালার্ট চালু করতে পারবেন।" : "Phone verified. You can now enable SMS alerts."); }
    else setMessage(result.error || (bn ? "কোড যাচাই হয়নি।" : "Could not verify the code."));
    setSaving(false);
  };
  const saveSms = async (next) => {
    setSaving(true); setMessage("");
    const result = await updateProfile({ smsAlertsEnabled: next });
    if (result.success) { setEnabled(next); setMessage(bn ? (next ? "SMS অ্যালার্ট চালু হয়েছে।" : "SMS অ্যালার্ট বন্ধ হয়েছে।") : (next ? "SMS reminders are enabled." : "SMS reminders are off.")); }
    else setMessage(result.error || "Could not save your preference.");
    setSaving(false);
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-7"><div className="flex items-center gap-2 text-sm font-semibold text-emerald"><Settings size={17}/> {bn ? "অ্যাকাউন্ট সেটিংস" : "Account settings"}</div><h1 className="mt-3 text-3xl font-bold text-content">{bn ? "আপনার পছন্দ" : "Your preferences"}</h1><p className="mt-2 text-sm text-muted">{bn ? "KrishiBondhu কীভাবে আপনাকে জানাবে তা ঠিক করুন।" : "Choose how KrishiBondhu keeps you updated."}</p></header>
      <section className="mb-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-content">{bn ? "যোগাযোগের ফোন নম্বর" : "Contact phone number"}</h2>{user?.phoneVerifiedAt&&<span className="rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">{bn ? "যাচাই করা হয়েছে" : "Verified"}</span>}</div><p className="mt-1 text-sm text-muted">{bn ? "নিজের সচল বাংলাদেশি মোবাইল নম্বর দিন; SMS চালুর আগে OTP দিয়ে যাচাই করতে হবে। নম্বরটি অন্য অ্যাকাউন্টে যুক্ত থাকলে সংরক্ষণ হবে না। যাচাই SMS-এ চার্জ লাগতে পারে; কোড কাউকে দেবেন না।" : "Enter your own active Bangladesh mobile number. Verify it with an SMS code before enabling alerts. A number already linked to another account cannot be used. Message charges may apply; never share your code."}</p><form onSubmit={savePhone} className="mt-4 flex flex-wrap items-end gap-3"><label className="block min-w-[240px] flex-1 text-sm font-medium text-content">{bn ? "মোবাইল নম্বর" : "Mobile number"}<input type="tel" required autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-content"/></label><button disabled={saving||phone===user?.phone} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={16}/>{bn ? "নম্বর সংরক্ষণ" : "Save number"}</button></form>{user?.phone&&!user.phoneVerifiedAt&&phone===user.phone&&<div className="mt-4"><button type="button" onClick={sendVerificationCode} disabled={saving} className="rounded-xl border border-forest px-4 py-2 text-sm font-semibold text-forest disabled:opacity-50">{bn ? "যাচাই কোড পাঠান" : "Send verification code"}</button>{codeSent&&<form onSubmit={verifyPhone} className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-medium text-content">{bn ? "৬ অঙ্কের কোড" : "Six-digit code"}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={e=>setVerificationCode(e.target.value.replace(/\D/g, ""))} className="mt-1.5 block w-44 rounded-xl border border-border bg-surface px-3 py-2.5 text-content"/></label><button disabled={saving||verificationCode.length!==6} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{bn ? "যাচাই করুন" : "Verify number"}</button></form>}</div>}{message&&<p role="status" className="mt-3 flex items-center gap-2 text-sm text-emerald">{message.includes("enabled")&&<Check size={15}/>} {message}</p>}</section>
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="rounded-xl bg-emerald/10 p-2.5 text-emerald"><Smartphone size={20}/></span><div className="min-w-0 flex-1"><h2 className="font-semibold text-content">{bn ? "খামার ও বাজারের SMS অ্যালার্ট" : "Farm and market SMS alerts"}</h2><p className="mt-1 text-sm leading-6 text-muted">{bn ? "আপনার যাচাই করা ফোন নম্বরে খামারের কাজের রিমাইন্ডার ও লক্ষ্যদরের খবর পাঠানো হবে" : "Receive new farm task reminders and price target alerts on your verified account phone number"}{user?.phone ? ` (${user.phone})` : ""}. {bn ? "SMS চার্জ প্রযোজ্য হতে পারে।" : "Message and data charges may apply."}</p>{!user?.phoneVerifiedAt&&<p className="mt-2 text-sm font-medium text-amber-strong">{bn ? "SMS চালু করতে আগে ফোন নম্বর যোগ ও যাচাই করুন।" : "Add and verify a phone number before enabling SMS alerts."}</p>}<label className="mt-5 flex items-center gap-3 text-sm font-medium text-content"><input type="checkbox" checked={enabled} disabled={saving||!user?.phoneVerifiedAt} onChange={e=>saveSms(e.target.checked)} className="h-4 w-4 accent-emerald"/><Bell size={16}/>{bn ? "এই SMS অ্যালার্ট পেতে সম্মতি দিচ্ছি। চাইলে যেকোনো সময় বন্ধ করতে পারি।" : "I agree to receive these SMS alerts. I can turn this off anytime."}</label><p className="mt-4 text-xs leading-5 text-muted">{bn ? "SMS পাঠাতে SSL Wireless ISMS Plus অ্যাকাউন্ট, অনুমোদিত Sender ID ও সার্ভার কনফিগারেশন লাগবে। সেটি না থাকলে SMS পাঠানো হবে না।" : "Live delivery requires the project owner to set up an SSL Wireless ISMS Plus account, registered sender ID and server credentials. Without that setup, no text is sent."}</p></div></div></section>
    </main>
  );
}

export default function ProtectedSettingsPage() {
  return <PrivateAccess><SettingsPage /></PrivateAccess>;
}
