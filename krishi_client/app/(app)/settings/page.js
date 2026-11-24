"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronRight, CircleUserRound, KeyRound, LogOut, MapPin, Moon, Phone, Settings, Sun } from "lucide-react";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import { SmsAlertsSettings } from "@/components/settings/SmsAlertsSettings.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLocation } from "@/contexts/LocationContext.js";
import { useTheme } from "@/contexts/ThemeContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

function SettingsPage() {
  const router = useRouter();
  const { user, updateProfile, requestPhoneVerification, confirmPhoneVerification, changePassword, logout } = useAuth();
  const { locale, setLocale } = useLang();
  const { theme, setTheme } = useTheme();
  const { selectedDistrict, setSelectedDistrict, districts } = useLocation();
  const bn = locale === "bn";
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const showMessage = (text, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const saveName = async (event) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || saving) return;
    setSaving(true);
    showMessage("");
    try {
      const result = await updateProfile({ name: nextName });
      if (result.success) {
        setName(result.user.name || nextName);
        showMessage(bn ? "নাম সংরক্ষণ হয়েছে।" : "Your name was saved.");
      } else showMessage(bn ? "নাম সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" : "Could not save your name. Please try again.", true);
    } finally {
      setSaving(false);
    }
  };

  const savePhone = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    showMessage("");
    try {
      const result = await updateProfile({ phone });
      if (result.success) {
        setPhone(result.user.phone || "");
        setCodeSent(false);
        setVerificationCode("");
        showMessage(bn ? "ফোন নম্বর সংরক্ষণ হয়েছে। SMS চালুর আগে নম্বর যাচাই করুন।" : "Phone number saved. Verify it before enabling SMS alerts.");
      } else showMessage(bn ? "ফোন নম্বর সংরক্ষণ করা যায়নি। নম্বরটি পরীক্ষা করে আবার চেষ্টা করুন।" : "Could not save the phone number. Check it and try again.", true);
    } finally {
      setSaving(false);
    }
  };

  const sendVerificationCode = async () => {
    if (saving) return;
    setSaving(true);
    showMessage("");
    try {
      const result = await requestPhoneVerification();
      if (result.success) {
        setCodeSent(true);
        showMessage(bn ? "৬ অঙ্কের কোড SMS-এ পাঠানো হয়েছে; ১০ মিনিটের মধ্যে দিন।" : "A six-digit code was sent by SMS; enter it within 10 minutes.");
      } else showMessage(bn ? "যাচাই কোড পাঠানো যায়নি। পরে আবার চেষ্টা করুন।" : "Could not send a verification code. Please try again later.", true);
    } finally {
      setSaving(false);
    }
  };

  const verifyPhone = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    showMessage("");
    try {
      const result = await confirmPhoneVerification(verificationCode);
      if (result.success) {
        setCodeSent(false);
        setVerificationCode("");
        showMessage(bn ? "ফোন নম্বর যাচাই হয়েছে। এখন SMS অ্যালার্ট চালু করতে পারবেন।" : "Phone verified. You can now enable SMS alerts.");
      } else showMessage(bn ? "কোড যাচাই হয়নি। কোডটি দেখে আবার চেষ্টা করুন।" : "That code could not be verified. Check it and try again.", true);
    } finally {
      setSaving(false);
    }
  };

  const saveAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || saving) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1_000_000) {
      showMessage(bn ? "PNG, JPEG বা WEBP ছবি (সর্বোচ্চ ১ MB) বেছে নিন।" : "Choose a PNG, JPEG or WEBP image up to 1 MB.", true);
      return;
    }
    setSaving(true);
    showMessage("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const result = await updateProfile({ avatarUrl: dataUrl });
      showMessage(result.success
        ? (bn ? "প্রোফাইল ছবি সংরক্ষণ হয়েছে।" : "Profile picture saved.")
        : (bn ? "ছবি সংরক্ষণ করা যায়নি।" : "Could not save the picture."), !result.success);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (savingPassword || newPassword.length < 8) return;
    setSavingPassword(true);
    showMessage("");
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        setCurrentPassword("");
        setNewPassword("");
        showMessage(bn ? "পাসওয়ার্ড পরিবর্তন হয়েছে।" : "Password changed.");
      } else {
        showMessage(result.error || (bn ? "পাসওয়ার্ড পরিবর্তন করা যায়নি।" : "Could not change password."), true);
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const districtName = (district) => bn ? district.nameBn || district.nameEn : district.nameEn;
  const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-content focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/20";
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-55";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 rounded-3xl border border-line bg-gradient-to-br from-emerald-50 via-surface to-amber-50/50 p-5 shadow-km-sm dark:from-emerald-950/25 dark:to-amber-950/15 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald"><Settings size={17} aria-hidden="true" />{bn ? "অ্যাকাউন্ট ও পছন্দ" : "Account & preferences"}</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-content sm:text-4xl">{bn ? "আপনার প্রোফাইল" : "Your profile"}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{bn ? "আপনার পরিচয়, এলাকা ও বার্তার পছন্দ এক জায়গায় পরিচালনা করুন।" : "Manage your profile, preferred area and communication choices in one place."}</p>
          </div>
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-muted"><CircleUserRound size={15} aria-hidden="true" />{user?.role === "admin" ? "Admin" : user?.role === "extension_officer" ? (bn ? "কৃষি কর্মকর্তা" : "Extension officer") : (bn ? "কৃষক অ্যাকাউন্ট" : "Farmer account")}</span>
        </div>
      </header>

      {message && <p role={messageIsError ? "alert" : "status"} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${messageIsError ? "border-danger/30 bg-danger/5 text-danger-strong" : "border-emerald/25 bg-emerald/5 text-emerald-strong"}`}>{message}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,.9fr)]">
        <div className="space-y-5">
          <section aria-labelledby="profile-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
            <div className="mb-5 flex items-start gap-3"><span className="rounded-xl bg-emerald/10 p-2.5 text-emerald"><CircleUserRound size={20} aria-hidden="true" /></span><div><h2 id="profile-heading" className="font-bold text-content">{bn ? "ব্যক্তিগত তথ্য" : "Personal information"}</h2><p className="mt-1 text-sm text-muted">{bn ? "নাম ও প্রোফাইল ছবি হালনাগাদ করুন।" : "Update your name and profile picture."}</p></div></div>
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
              <div aria-hidden="true" className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-emerald/30 bg-emerald/10 bg-cover bg-center" style={user?.avatarUrl ? { backgroundImage: `url("${user.avatarUrl}")` } : undefined}>
                {!user?.avatarUrl && <span className="flex h-full w-full items-center justify-center text-emerald"><CircleUserRound size={34} /></span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-content">{bn ? "প্রোফাইল ছবি" : "Profile picture"}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{bn ? "PNG, JPEG বা WEBP, সর্বোচ্চ ১ MB।" : "PNG, JPEG or WEBP, up to 1 MB."}</p>
                <label className={`${buttonClass} mt-3 cursor-pointer border border-line bg-surface text-content hover:bg-surface-2`}>
                  <Camera size={16} aria-hidden="true" />{bn ? "ছবি পরিবর্তন" : "Change picture"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={saveAvatar} className="sr-only" aria-label={bn ? "প্রোফাইল ছবি বেছে নিন" : "Choose profile picture"} />
                </label>
              </div>
            </div>
            <form onSubmit={saveName} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block text-sm font-medium text-content">{bn ? "পুরো নাম" : "Full name"}<input autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
              <button type="submit" disabled={saving || !name.trim() || name.trim() === user?.name} className={`${buttonClass} bg-forest text-white hover:bg-forest-700`}>{saving ? (bn ? "সংরক্ষণ…" : "Saving…") : (bn ? "নাম সংরক্ষণ" : "Save name")}<ChevronRight size={16} aria-hidden="true" /></button>
            </form>
            {user?.email && <p className="mt-4 break-all text-xs text-muted">{bn ? "অ্যাকাউন্ট ইমেইল" : "Account email"}: {user.email}</p>}
          </section>

          <section aria-labelledby="location-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
            <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-sky-100 p-2.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"><MapPin size={20} aria-hidden="true" /></span><div><h2 id="location-heading" className="font-bold text-content">{bn ? "আপনার এলাকার পছন্দ" : "Preferred area"}</h2><p className="mt-1 text-sm leading-6 text-muted">{bn ? "এলাকা আবহাওয়া, মানচিত্র ও কৃষি তথ্যের প্রেক্ষাপটে ব্যবহার হয়; এটি জমির সুনির্দিষ্ট অবস্থান নয়।" : "This area sets context for weather, maps and agricultural information. It is not a precise field location."}</p></div></div>
            <label className="block text-sm font-medium text-content">{bn ? "জেলা" : "District"}<select aria-label={bn ? "পছন্দের জেলা" : "Preferred district"} value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} className={fieldClass}>{districts.map((district) => <option key={district.code} value={district.code}>{districtName(district)}</option>)}</select></label>
            <p className="mt-2 text-xs leading-5 text-muted">{bn ? "নির্বাচনটি এই ডিভাইসে রাখা হয় এবং সাইন ইন থাকলে অ্যাকাউন্টে সিঙ্ক করা হয়।" : "Your selection is stored on this device and synced to your account when signed in."}</p>
          </section>

          <section aria-labelledby="phone-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><span className="rounded-xl bg-amber-100 p-2.5 text-amber-800 dark:bg-amber-950/35 dark:text-amber-300"><Phone size={20} aria-hidden="true" /></span><div><h2 id="phone-heading" className="font-bold text-content">{bn ? "ফোন ও যাচাই" : "Phone & verification"}</h2><p className="mt-1 text-sm leading-6 text-muted">{bn ? "SMS অ্যালার্টের আগে ফোন নম্বর যাচাই করুন। কোড কাউকে দেবেন না।" : "Verify your phone before enabling SMS alerts. Never share your code."}</p></div></div>{user?.phoneVerifiedAt && <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-emerald/10 px-3 text-xs font-semibold text-emerald"><Check size={14} aria-hidden="true" />{bn ? "যাচাইকৃত" : "Verified"}</span>}</div>
            <form onSubmit={savePhone} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block text-sm font-medium text-content">{bn ? "বাংলাদেশি মোবাইল নম্বর" : "Bangladesh mobile number"}<input type="tel" required autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+8801XXXXXXXXX" className={fieldClass} /></label>
              <button type="submit" disabled={saving || phone === user?.phone} className={`${buttonClass} border border-line bg-surface text-content hover:bg-surface-2`}>{bn ? "নম্বর সংরক্ষণ" : "Save number"}</button>
            </form>
            {user?.phone && !user.phoneVerifiedAt && phone === user.phone && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={sendVerificationCode} disabled={saving} className={`${buttonClass} border border-forest text-forest hover:bg-emerald/5`}>{bn ? "যাচাই কোড পাঠান" : "Send verification code"}</button>{codeSent && <form onSubmit={verifyPhone} className="flex flex-wrap items-end gap-3"><label className="block text-sm font-medium text-content">{bn ? "৬ অঙ্কের কোড" : "Six-digit code"}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} className={`${fieldClass} w-40`} /></label><button type="submit" disabled={saving || verificationCode.length !== 6} className={`${buttonClass} bg-forest text-white hover:bg-forest-700`}>{bn ? "যাচাই করুন" : "Verify"}</button></form>}</div>}
            <p className="mt-4 text-xs leading-5 text-muted">{bn ? "SMS পাঠাতে সেবাদাতার অ্যাকাউন্ট ও সার্ভার কনফিগারেশন দরকার; সেটআপ না থাকলে বার্তা পাঠানো হবে না। SMS চার্জ প্রযোজ্য হতে পারে।" : "SMS delivery requires the project owner’s provider account and server configuration. No message is sent without that setup. Carrier charges may apply."}</p>
          </section>

          <SmsAlertsSettings />
        </div>

        <aside className="space-y-5">
          <section aria-labelledby="display-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
            <h2 id="display-heading" className="font-bold text-content">{bn ? "প্রদর্শনের পছন্দ" : "Display preferences"}</h2>
            <div className="mt-5"><p className="text-sm font-semibold text-content">{bn ? "ভাষা" : "Language"}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" aria-pressed={locale === "bn"} onClick={() => setLocale("bn")} className={`${buttonClass} border ${locale === "bn" ? "border-forest bg-sage text-forest-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-line bg-surface text-content hover:bg-surface-2"}`}>বাংলা</button><button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")} className={`${buttonClass} border ${locale === "en" ? "border-forest bg-sage text-forest-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-line bg-surface text-content hover:bg-surface-2"}`}>English</button></div></div>
            <div className="mt-5"><p className="text-sm font-semibold text-content">{bn ? "থিম" : "Theme"}</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")} className={`${buttonClass} border ${theme === "light" ? "border-forest bg-sage text-forest-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-line bg-surface text-content hover:bg-surface-2"}`}><Sun size={16} aria-hidden="true" />{bn ? "লাইট" : "Light"}</button><button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} className={`${buttonClass} border ${theme === "dark" ? "border-forest bg-sage text-forest-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-line bg-surface text-content hover:bg-surface-2"}`}><Moon size={16} aria-hidden="true" />{bn ? "ডার্ক" : "Dark"}</button></div></div>
            <p className="mt-4 text-xs leading-5 text-muted">{bn ? "ভাষা ও থিমের পছন্দ এই ব্রাউজারে সংরক্ষিত থাকে।" : "Language and theme preferences are saved in this browser."}</p>
          </section>

          <section aria-labelledby="account-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
            <h2 id="account-heading" className="font-bold text-content">{bn ? "অ্যাকাউন্ট" : "Account"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{bn ? "এই ডিভাইসে আপনার বর্তমান সেশন বন্ধ করুন।" : "Sign out of your current session on this device."}</p>
            {!confirmLogout ? <button type="button" onClick={() => setConfirmLogout(true)} className={`${buttonClass} mt-4 w-full border border-danger/30 text-danger-strong hover:bg-danger/5`}><LogOut size={16} aria-hidden="true" />{bn ? "লগআউট" : "Sign out"}</button> : <div className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-4" role="group" aria-label={bn ? "লগআউট নিশ্চিত করুন" : "Confirm sign out"}><p className="text-sm font-semibold text-content">{bn ? "আপনি কি লগআউট করতে চান?" : "Sign out of KrishiBondhu?"}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setConfirmLogout(false)} className={`${buttonClass} flex-1 border border-line bg-surface text-content`}>{bn ? "থাকুন" : "Stay"}</button><button type="button" onClick={handleLogout} className={`${buttonClass} flex-1 bg-danger-strong text-white hover:opacity-90`}>{bn ? "লগআউট" : "Sign out"}</button></div></div>}
            <div className="mt-5 border-t border-line pt-5">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-content"><KeyRound size={16} aria-hidden="true" />{bn ? "পাসওয়ার্ড পরিবর্তন" : "Change password"}</p>
              <form onSubmit={savePassword} className="grid gap-3">
                <label className="block text-sm font-medium text-content">{bn ? "বর্তমান পাসওয়ার্ড" : "Current password"}<input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={fieldClass} /></label>
                <label className="block text-sm font-medium text-content">{bn ? "নতুন পাসওয়ার্ড" : "New password"}<input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={fieldClass} /></label>
                <button type="submit" disabled={savingPassword || currentPassword.length === 0 || newPassword.length < 8} className={`${buttonClass} w-full bg-forest text-white hover:bg-forest-700`}>{savingPassword ? (bn ? "সংরক্ষণ…" : "Saving…") : (bn ? "পাসওয়ার্ড আপডেট" : "Update password")}</button>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default function ProtectedSettingsPage() {
  return <PrivateAccess><SettingsPage /></PrivateAccess>;
}
