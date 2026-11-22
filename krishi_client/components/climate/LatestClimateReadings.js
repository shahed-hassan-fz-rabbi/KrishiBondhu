"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CloudSun, Info } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card.js";
import { fetchClimateLatest } from "@/services/api.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

const PARAMETER_LABELS = {
  PRECTOTCORR: { en: "Precipitation", bn: "বৃষ্টিপাত" },
  T2M: { en: "Mean air temperature", bn: "গড় বায়ুর তাপমাত্রা" },
  T2M_MAX: { en: "Maximum air temperature", bn: "সর্বোচ্চ বায়ুর তাপমাত্রা" },
  T2M_MIN: { en: "Minimum air temperature", bn: "সর্বনিম্ন বায়ুর তাপমাত্রা" },
  RH2M: { en: "Relative humidity", bn: "আপেক্ষিক আর্দ্রতা" },
  ALLSKY_SFC_SW_DWN: { en: "Solar radiation", bn: "সৌর বিকিরণ" },
};

function formatObservationDate(value, locale) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export default function LatestClimateReadings({ district, districtName }) {
  const { locale } = useLang();
  const isBn = locale === "bn";
  const [state, setState] = useState({ status: "loading", district: null, data: null, meta: null, isStale: false });

  useEffect(() => {
    let active = true;
    fetchClimateLatest(district).then((response) => {
      if (!active) return;
      if (response.success && response.data?.observations) {
        const dates = Object.values(response.data.observations).map((row) => row?.observationDate).filter(Boolean).sort();
        const newestDate = dates.at(-1);
        const ageDays = newestDate ? Math.floor((Date.now() - new Date(`${newestDate}T00:00:00Z`).getTime()) / 86400000) : null;
        setState({ status: "ready", district, data: response.data, meta: response.meta, isStale: ageDays !== null && ageDays > 7 });
      } else setState({ status: "unavailable", district, data: null, meta: null, isStale: false });
    }).catch(() => {
      if (active) setState({ status: "unavailable", district, data: null, meta: null, isStale: false });
    });
    return () => { active = false; };
  }, [district]);

  const observations = state.data?.observations || {};
  const rows = Object.entries(PARAMETER_LABELS)
    .filter(([key]) => Number.isFinite(observations[key]?.value))
    .map(([key, label]) => ({ key, label: label[isBn ? "bn" : "en"], ...observations[key] }));
  const dates = rows.map((row) => row.observationDate).filter(Boolean).sort();
  const oldestDate = dates[0];
  const newestDate = dates.at(-1);
  const currentStatus = state.district === district ? state.status : "loading";
  const isStale = state.isStale;

  return <section aria-labelledby="latest-climate-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-km-sm">
    <div className="flex flex-col gap-4 border-b border-line bg-gradient-to-r from-amber-50/80 via-surface to-emerald-50/50 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 dark:from-amber-950/20 dark:to-emerald-950/10">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"><CloudSun className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 id="latest-climate-title" className="text-lg font-semibold text-content">{isBn ? "সর্বশেষ সংরক্ষিত জলবায়ু পর্যবেক্ষণ" : "Latest stored climate observations"}</h2>
          <p className="mt-1 text-sm text-muted">{isBn ? `${districtName} · NASA POWER দৈনিক ডেটাবেস` : `${districtName} · NASA POWER daily archive`}</p>
        </div>
      </div>
      <span className={`inline-flex min-h-8 items-center self-start rounded-full px-3 text-xs font-semibold ${isStale ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"}`}>
        {currentStatus === "loading" ? (isBn ? "লোড হচ্ছে" : "Loading") : currentStatus === "unavailable" ? (isBn ? "এখন পাওয়া যাচ্ছে না" : "Unavailable") : isStale ? (isBn ? "পুরোনো পর্যবেক্ষণ" : "Older observation") : (isBn ? "সর্বশেষ সংরক্ষিত" : "Latest stored")}
      </span>
    </div>
    <CardBody>
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-surface-2/70 px-3 py-2.5 text-xs leading-5 text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{isBn ? "এগুলো NASA POWER-এ সংরক্ষিত ঐতিহাসিক দৈনিক মান; লাইভ আবহাওয়া বা পূর্বাভাস নয়। উৎসের গ্রিড প্রায় ৫০ কিমি।" : "These are historical daily values stored from NASA POWER, not live weather or a forecast. Source grid resolution is approximately 50 km."}</p>
      {currentStatus === "loading" ? <div className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={isBn ? "জলবায়ু পর্যবেক্ষণ লোড হচ্ছে" : "Loading climate observations"}>{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-20 rounded-xl bg-surface-2" />)}</div>
        : currentStatus === "unavailable" || rows.length === 0 ? <p className="rounded-xl border border-dashed border-line px-4 py-7 text-center text-sm text-muted">{isBn ? "এই জেলার জন্য যাচাইকৃত সংরক্ষিত পর্যবেক্ষণ পাওয়া যায়নি। পরে আবার চেষ্টা করুন." : "No verified archived observations are available for this district right now. Try again later."}</p>
          : <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => <article key={row.key} className="min-w-0 rounded-xl border border-line bg-bg/60 p-4">
                <p className="text-xs font-medium text-muted">{row.label}</p>
                <p className="mt-2 truncate text-xl font-semibold tabular-nums text-content">{new Intl.NumberFormat(isBn ? "bn-BD" : "en-GB", { maximumFractionDigits: 1 }).format(row.value)} <span className="text-sm font-normal text-muted">{row.unit}</span></p>
                <p className="mt-1 text-xs text-muted">{isBn ? "পর্যবেক্ষণের তারিখ" : "Observed"}: {formatObservationDate(row.observationDate, locale) || "—"}</p>
              </article>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{isBn ? "সংরক্ষিত তারিখের পরিসর" : "Stored observation dates"}: {formatObservationDate(oldestDate, locale) || "—"} – {formatObservationDate(newestDate, locale) || "—"}</span>
              <span>{isBn ? "উৎস" : "Source"}: {state.meta?.provider || "NASA POWER / Langley Research Center"}</span>
              <span>{isBn ? "সময়মান" : "Time standard"}: {state.meta?.timeStandard || "LST"}</span>
              <span>{isBn ? "ডেটা ধরন" : "Record type"}: {isBn ? "ঐতিহাসিক, পূর্বাভাস নয়" : "Historical, not forecast"}</span>
            </div>
          </>}
    </CardBody>
  </section>;
}
