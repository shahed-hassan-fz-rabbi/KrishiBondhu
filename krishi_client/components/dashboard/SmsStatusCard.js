"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";

import { fetchSmsSubscriptions } from "@/services/api.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

const CATEGORIES = ["weather", "market", "farmReminder"];

/** Upper-dashboard quick access to the REAL SMS settings state. No fake counts. */
export function SmsStatusCard() {
  const { t } = useLang();
  const bn = t("smsAlerts.title") === "এসএমএস অ্যালার্ট";
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await fetchSmsSubscriptions();
    if (result.success) setPreferences(result.data || null);
    else setError(bn ? "এসএমএস পছন্দ লোড করা যায়নি।" : "Could not load SMS preferences.");
    setLoading(false);
  }, [bn]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const verified = Boolean(preferences?.phone?.verified);
  const last4 = preferences?.phone?.last4;
  const onCount = CATEGORIES.filter((key) => preferences?.categories?.[key]?.enabled).length;

  const label = (key) => t(`smsAlerts.${key}`);

  return (
    <section aria-labelledby="dashboard-sms-heading" data-bondhu-no-fly className="mb-5 rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-surface to-amber-50/50 p-5 shadow-km-sm dark:border-emerald-900/50 dark:from-emerald-950/25 dark:via-surface dark:to-amber-950/10 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-emerald/10 p-2.5 text-emerald"><Bell size={20} aria-hidden="true" /></span>
          <div>
            <h2 id="dashboard-sms-heading" className="font-bold text-content">{bn ? "এসএমএস অ্যালার্ট" : "SMS alerts"}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
              {bn
                ? "আবহাওয়া, বাজার ও খামারের কাজের বার্তা — আপনার পছন্দ অনুযায়ী। এখন ড্রাই-রান মোডে, real SMS যায় না।"
                : "Weather, market and farm work updates — only what you choose. Currently in dry-run mode: no real SMS is sent."}
            </p>
          </div>
        </div>
        <span className={`inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${verified ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber-strong"}`}>
          <ShieldCheck size={14} aria-hidden="true" />
          {verified ? (bn ? "ফোন যাচাইকৃত" : "Phone verified") : (bn ? "ফোন যাচাই করা হয়নি" : "Phone not verified")}
          {last4 ? ` · ••••${last4}` : ""}
        </span>
      </div>

      {loading ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{bn ? "পছন্দ লোড হচ্ছে…" : "Loading preferences…"}</p>
      ) : error ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger-strong" role="alert">
          <TriangleAlert size={16} aria-hidden="true" /><span>{error}</span>
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 font-semibold text-content">{bn ? "আবার চেষ্টা" : "Retry"}</button>
        </div>
      ) : (
        <div className="mt-4">
          <ul className="flex flex-wrap gap-2">
            {CATEGORIES.map((key) => {
              const enabled = Boolean(preferences?.categories?.[key]?.enabled);
              return (
                <li key={key} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${enabled ? "border-emerald/30 bg-emerald/10 text-emerald" : "border-line bg-surface text-muted"}`}>
                  {enabled && <Check size={13} aria-hidden="true" />}
                  {label(key)}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">
            {bn
              ? `চালু আছে: ${onCount}/৩। ${verified ? "নম্বর যাচাইকৃত।" : "এসএমএস চালুর আগে নম্বর যাচাই করুন।"}`
              : `${onCount} of 3 on. ${verified ? "Your number is verified." : "Verify your number before enabling alerts."}`}
          </p>
        </div>
      )}

      <Link href="/settings#sms-alerts-heading" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        {bn ? "এসএমএস অ্যালার্ট পরিচালনা করুন" : "Manage SMS alerts"}
      </Link>
    </section>
  );
}
