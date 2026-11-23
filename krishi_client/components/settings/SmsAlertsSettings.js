"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, LoaderCircle, ShieldCheck } from "lucide-react";

import { fetchSmsSubscriptions, unsubscribeAllSms, updateSmsSubscription } from "@/services/api.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

const CATEGORIES = [
  { key: "weather", labelKey: "weather", descKey: "weatherDesc" },
  { key: "market", labelKey: "market", descKey: "marketDesc" },
  { key: "farmReminder", labelKey: "farmReminder", descKey: "farmReminderDesc" },
];

const DEFAULT_PREFERENCES = {
  categories: {
    weather: { enabled: false, subscribedAt: null, unsubscribedAt: null },
    market: { enabled: false, subscribedAt: null, unsubscribedAt: null },
    farmReminder: { enabled: false, subscribedAt: null, unsubscribedAt: null },
  },
  consent: { givenAt: null, revokedAt: null, source: null },
  phone: { verified: false, last4: null },
};

/** Map an API failure to a short, farmer-friendly status message. */
function errorMessage(t, result, fallbackKey) {
  if (result?.status === 401) return t("smsAlerts.signIn");
  if (result?.status === 403) return t("smsAlerts.forbidden");
  if (result?.status === 429) return t("smsAlerts.rateLimited");
  const code = result?.error?.code;
  if (code === "PHONE_NOT_VERIFIED") return "PHONE_NOT_VERIFIED";
  return t(fallbackKey);
}

export function SmsAlertsSettings() {
  const { t } = useLang();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingCategory, setPendingCategory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const result = await fetchSmsSubscriptions();
    if (result.success) {
      setPreferences(result.data || DEFAULT_PREFERENCES);
    } else {
      setLoadError(errorMessage(t, result, "smsAlerts.loadFailed"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const phoneVerified = Boolean(preferences?.phone?.verified);
  const last4 = preferences?.phone?.last4;

  const applyResult = (result, successKey) => {
    if (result.success) {
      // Only update displayed state after the server confirms.
      if (result.data?.preferences) setPreferences(result.data.preferences);
      setStatus(t(successKey));
      return true;
    }
    setStatus(errorMessage(t, result, "smsAlerts.saveFailed"));
    return false;
  };

  const disableCategory = async (category) => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    const result = await updateSmsSubscription(category, false);
    applyResult(result, "smsAlerts.savedOff");
    setBusy(false);
  };

  const confirmEnable = async () => {
    if (!pendingCategory || busy) return;
    setBusy(true);
    setStatus("");
    const result = await updateSmsSubscription(pendingCategory, true);
    const ok = applyResult(result, "smsAlerts.savedOn");
    if (ok) setPendingCategory(null);
    setBusy(false);
  };

  const doUnsubscribeAll = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    const result = await unsubscribeAllSms();
    const ok = applyResult(result, "smsAlerts.unsubscribed");
    if (ok) setConfirmUnsubscribe(false);
    setBusy(false);
  };

  const showPhoneGate = status === "PHONE_NOT_VERIFIED" || !phoneVerified;
  const switchClass = "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section aria-labelledby="sms-alerts-heading" className="rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-emerald/10 p-2.5 text-emerald"><Bell size={20} aria-hidden="true" /></span>
          <div>
            <h2 id="sms-alerts-heading" className="font-bold text-content">{t("smsAlerts.title")}</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{t("smsAlerts.subtitle")}</p>
          </div>
        </div>
        <span className={`inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${phoneVerified ? "bg-emerald/10 text-emerald" : "bg-amber/10 text-amber-strong"}`}>
          <ShieldCheck size={14} aria-hidden="true" />
          {phoneVerified ? t("smsAlerts.verified") : t("smsAlerts.notVerified")}
          {last4 ? ` · ••••${last4}` : ""}
        </span>
      </div>

      {showPhoneGate && (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-strong">{t("smsAlerts.verificationNeeded")}</p>
          <p className="mt-1 leading-6 text-muted">{t("smsAlerts.verificationNeededBody")}</p>
          <a href="#phone-heading" className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-forest px-3 font-semibold text-white hover:bg-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            {t("smsAlerts.goToVerification")}
          </a>
        </div>
      )}

      {loading ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />{t("smsAlerts.loading")}</p>
      ) : loadError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger-strong" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 font-semibold text-content">{t("smsAlerts.retry")}</button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {CATEGORIES.map(({ key, labelKey, descKey }) => {
            const isOn = Boolean(preferences?.categories?.[key]?.enabled);
            const disabled = busy || !phoneVerified || Boolean(pendingCategory);
            return (
              <div key={key} className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-content">{t(`smsAlerts.${labelKey}`)}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{t(`smsAlerts.${descKey}`)}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`${t(`smsAlerts.${labelKey}`)}: ${isOn ? t("smsAlerts.turnOff") : t("smsAlerts.turnOn")}`}
                  disabled={disabled}
                  onClick={() => (isOn ? disableCategory(key) : setPendingCategory(key))}
                  className={`${switchClass} ${isOn ? "bg-forest" : "bg-line"}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            );
          })}

          {pendingCategory && (
            <div className="rounded-xl border border-forest/30 bg-sage/60 p-4" role="group" aria-labelledby="consent-title">
              <p id="consent-title" className="font-semibold text-forest-900 dark:text-emerald-100">{t("smsAlerts.consentTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{t("smsAlerts.consentBody")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={confirmEnable} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-55">
                  {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                  {t("smsAlerts.confirmEnable")}
                </button>
                <button type="button" onClick={() => setPendingCategory(null)} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-content">{t("smsAlerts.cancel")}</button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted">{t("smsAlerts.allOffNote")}</p>
            {confirmUnsubscribe ? (
              <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 sm:flex-row" role="group" aria-label={t("smsAlerts.unsubscribeConfirmTitle")}>
                <p className="text-sm font-semibold text-danger-strong">{t("smsAlerts.unsubscribeConfirmBody")}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={doUnsubscribeAll} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl bg-danger-strong px-3 text-sm font-semibold text-white disabled:opacity-55">{t("smsAlerts.confirmUnsubscribe")}</button>
                  <button type="button" onClick={() => setConfirmUnsubscribe(false)} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-content">{t("smsAlerts.keepSubscriptions")}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmUnsubscribe(true)} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-danger/30 px-4 text-sm font-semibold text-danger-strong hover:bg-danger/5">{t("smsAlerts.unsubscribeAll")}</button>
            )}
          </div>

          <p aria-live="polite" className={`min-h-5 text-sm font-medium ${status && status !== "PHONE_NOT_VERIFIED" ? "text-emerald-strong" : ""}`}>{status === "PHONE_NOT_VERIFIED" ? "" : status}</p>
        </div>
      )}
    </section>
  );
}
