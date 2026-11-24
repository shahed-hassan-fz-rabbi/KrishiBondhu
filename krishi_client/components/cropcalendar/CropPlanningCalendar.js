"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Compass,
  Droplets,
  Info,
  Leaf,
  Thermometer,
} from "lucide-react";

import { useLang } from "@/lib/i18n/LanguageContext.js";
import { fetchWeatherAlerts, fetchWeatherForecast } from "@/services/api.js";
import { getBangladeshDateKey } from "@/lib/bangladeshDate.js";

const MS_DAY = 24 * 60 * 60 * 1000;
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BN_WEEKDAYS = ["সো", "মং", "বু", "বৃ", "শু", "শ", "রবি"];

const addDays = (date, days) => new Date(date.getTime() + days * MS_DAY);
const dateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const parseKey = (key) => {
  const [y, m, d] = String(key || "").split("-").map(Number);
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    ? new Date(Date.UTC(y, m - 1, d))
    : null;
};

/**
 * Start date of a standard meteorological week, using the same convention as the
 * server: week 1 begins on 1 January, each following week is a 7-day block.
 * This keeps calendar highlights consistent with the API's current-stage logic.
 */
function smwStartDate(year, week) {
  const clamped = Math.max(1, Math.min(52, week));
  return new Date(Date.UTC(year, 0, 1 + (clamped - 1) * 7));
}

/** Converts official SMW stage windows into civil date ranges. Dates are derived estimates, not published dates. */
function buildStageEvents(districtCal, anchorYears) {
  const stages = districtCal?.stages;
  if (!Array.isArray(stages)) return [];
  const events = [];
  for (const year of anchorYears) {
    for (const stage of stages) {
      const [startWeek, endWeek] = Array.isArray(stage.standardWeeks) ? stage.standardWeeks : [];
      if (!Number.isInteger(startWeek) || !Number.isInteger(endWeek)) continue;
      const start = smwStartDate(year, startWeek);
      const endStart = smwStartDate(startWeek <= endWeek ? year : year + 1, endWeek);
      const end = addDays(endStart, 6);
      events.push({
        id: `${stage.stageId}-${year}`,
        stageId: stage.stageId,
        stageNameEn: stage.stageNameEn,
        stageNameBn: stage.stageNameBn,
        durationDays: stage.durationDays,
        waterRequirementMm: stage.waterRequirementMm,
        optimalTempRange: stage.optimalTempRange,
        weatherHazards: stage.weatherHazards,
        standardWeeks: stage.standardWeeks,
        start,
        end,
      });
    }
  }
  return events;
}

const inRange = (day, event) => day >= event.start && day <= event.end;

export default function CropPlanningCalendar({ districtCal, cropInfo, alignment, districtCode, districtName }) {
  const { locale, t } = useLang();
  const isBn = locale === "bn";
  const tp = (key) => t(`calendarSimple.planningCalendar.${key}`);

  const todayKey = useMemo(() => getBangladeshDateKey(), []);
  const today = useMemo(() => parseKey(todayKey), [todayKey]);
  const [viewYear, setViewYear] = useState(() => today.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getUTCMonth());
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [completed, setCompleted] = useState({});
  const [weather, setWeather] = useState(null);
  const [weatherStatus, setWeatherStatus] = useState("loading");
  const [alerts, setAlerts] = useState([]);

  const anchorYears = useMemo(() => [viewYear - 1, viewYear, viewYear + 1], [viewYear]);
  const events = useMemo(() => buildStageEvents(districtCal, anchorYears), [districtCal, anchorYears]);

  const seasonEvents = useMemo(() => {
    const range = districtCal?.standardWeeksRange;
    if (!Array.isArray(range) || range.length !== 2) return [];
    return buildStageEvents({ stages: [{ stageId: "season", stageNameEn: "Season", stageNameBn: "মৌসুম", standardWeeks: range }] }, [viewYear - 1, viewYear, viewYear + 1]);
  }, [districtCal, viewYear]);

  const storageKey = `krishibondhu:crop-calendar:${districtCode}:${cropInfo?.cropId || ""}`;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object") setCompleted(parsed);
        }
      } catch {
        /* task completion is an optional device-local convenience */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  const toggleTask = useCallback((id) => {
    setCompleted((previous) => {
      const next = { ...previous, [id]: !previous[id] };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      setWeather(null);
      setAlerts([]);
      setWeatherStatus("loading");
      Promise.allSettled([
        fetchWeatherForecast({ location: districtCode }),
        fetchWeatherAlerts({ district: districtCode, crop: cropInfo?.cropId }),
      ]).then(([forecastResult, alertsResult]) => {
        if (!active) return;
        if (forecastResult.status === "fulfilled" && forecastResult.value?.success && forecastResult.value.data?.shortRangeForecast?.length) {
          setWeather(forecastResult.value.data);
          setWeatherStatus("ready");
        } else {
          setWeatherStatus("unavailable");
        }
        if (alertsResult.status === "fulfilled" && alertsResult.value?.success && Array.isArray(alertsResult.value.data?.alerts)) {
          setAlerts(alertsResult.value.data.alerts);
        }
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [districtCode, cropInfo?.cropId]);

  const selectedDate = parseKey(selectedKey) || today;
  const selectedEvents = events.filter((event) => inRange(selectedDate, event));
  const upcoming = useMemo(() => {
    const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    return events
      .filter((event) => event.start >= now)
      .sort((a, b) => a.start - b.start)
      .slice(0, 4);
  }, [events, today]);

  const moveMonth = (delta) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
    const selectedDay = parseKey(selectedKey)?.getUTCDate() || 1;
    const daysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    setSelectedKey(dateKey(new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(selectedDay, daysInNextMonth)))));
  };
  const goToday = () => {
    setViewYear(today.getUTCFullYear());
    setViewMonth(today.getUTCMonth());
    setSelectedKey(todayKey);
  };
  const selectDate = (key) => {
    const date = parseKey(key);
    if (!date) return;
    setSelectedKey(key);
    setViewYear(date.getUTCFullYear());
    setViewMonth(date.getUTCMonth());
  };

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(Date.UTC(viewYear, viewMonth, index + 1))),
  ];

  const monthLabel = isBn ? BN_MONTHS[viewMonth] : EN_MONTHS[viewMonth];
  const shortDate = (date) => `${date.getUTCDate()} ${isBn ? BN_MONTHS[date.getUTCMonth()] : EN_MONTHS[date.getUTCMonth()].slice(0, 3)}`;
  const stageName = (event) => (isBn ? event.stageNameBn : event.stageNameEn) || event.stageNameEn;
  const forecastDays = weather?.shortRangeForecast?.slice(0, 7) || [];

  return (
    <section className="rounded-3xl border border-forest-200 bg-surface p-4 shadow-xs sm:p-6 dark:border-forest-900/40">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={18} strokeWidth={1.8} className="text-forest-600 dark:text-emerald-300" />
            <h2 className="text-base font-bold text-ink sm:text-lg">{tp("title")}</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{tp("intro")}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <Info size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="max-w-[280px]">{tp("derivedNote")}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* Calendar grid */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => moveMonth(-1)} aria-label={tp("prevMonth")} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink transition hover:border-forest-400">
                <ChevronLeft size={17} />
              </button>
              <div className="min-w-[132px] text-center text-sm font-bold text-ink">
                {monthLabel} {viewYear}
              </div>
              <button type="button" onClick={() => moveMonth(1)} aria-label={tp("nextMonth")} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink transition hover:border-forest-400">
                <ChevronRight size={17} />
              </button>
            </div>
            <button type="button" onClick={goToday} className="rounded-xl border border-forest-300 bg-forest-50 px-3 py-2 text-xs font-semibold text-forest-800 transition hover:bg-forest-100 dark:border-forest-700 dark:bg-forest-950/40 dark:text-emerald-200">
              {tp("today")}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 border-b border-line pb-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted">
            {(isBn ? BN_WEEKDAYS : WEEKDAYS).map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} aria-hidden="true" className="min-h-[62px] sm:min-h-[78px]" />;
              const key = dateKey(day);
              const dayEvents = events.filter((event) => inRange(day, event));
              const daySeason = seasonEvents.some((event) => inRange(day, event));
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDate(key)}
                  aria-pressed={isSelected}
                  aria-label={`${key}${dayEvents.length ? ` · ${dayEvents.map(stageName).join(", ")}` : ""}`}
                  className={`flex min-h-[62px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition sm:min-h-[78px] sm:p-2 ${
                    isSelected
                      ? "border-forest-600 bg-forest-50 ring-1 ring-forest-500/30 dark:border-emerald-500 dark:bg-forest-950/40"
                      : "border-line/70 bg-surface hover:border-forest-300 dark:hover:border-forest-700"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-forest-600 text-white" : isSelected ? "text-forest-800 dark:text-emerald-200" : "text-ink"}`}>
                    {day.getUTCDate()}
                  </span>
                  <span className="flex w-full flex-col gap-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span key={event.id} className={`truncate rounded px-1 py-0.5 text-[9px] font-semibold ${isSelected ? "bg-forest-100 text-forest-900 dark:bg-forest-900 dark:text-emerald-100" : "bg-surface-2 text-muted"}`}>
                        {stageName(event)}
                      </span>
                    ))}
                    {dayEvents.length > 2 && <span className="px-1 text-[9px] text-muted">+{dayEvents.length - 2}</span>}
                    {!dayEvents.length && daySeason && <span className="h-1 w-1 rounded-full bg-forest-400" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            {tp("weekHint")} {districtName ? `· ${districtName}` : ""} {districtCal?.sourcePublisher ? `· ${districtCal.sourcePublisher}` : ""}
          </p>
        </div>

        {/* Detail rail */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tp("selectedDate")}</p>
            <p className="mt-1 text-sm font-bold text-ink">{shortDate(selectedDate)} · {selectedDate.getUTCFullYear()}</p>
            {alignment?.officialCalendar?.currentStage?.stageNameEn && (
              <p className="mt-1 text-[11px] font-semibold text-forest-700 dark:text-emerald-300">
                {tp("currentStageToday")}:
                {isBn ? alignment.officialCalendar.currentStage.stageNameBn : alignment.officialCalendar.currentStage.stageNameEn}
              </p>
            )}
            {selectedEvents.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-muted">{tp("noStage")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {selectedEvents.map((event) => {
                  const taskId = `${event.id}:${selectedKey}`;
                  const done = Boolean(completed[taskId]);
                  return (
                    <div key={event.id} className={`rounded-xl border p-3 ${done ? "border-forest-300 bg-forest-50/60 dark:bg-forest-950/30" : "border-line bg-surface"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-ink">{stageName(event)}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted">SMW {event.standardWeeks[0]}–{event.standardWeeks[1]} · {shortDate(event.start)} – {shortDate(event.end)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleTask(taskId)}
                          aria-pressed={done}
                          aria-label={done ? tp("markUndone") : tp("markDone")}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${done ? "border-forest-600 bg-forest-600 text-white" : "border-line bg-surface text-muted hover:border-forest-400"}`}
                        >
                          <Check size={15} />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted">
                        <span className="inline-flex items-center gap-1"><Droplets size={12} className="text-blue-600" />{event.waterRequirementMm ?? "—"} mm</span>
                        {Array.isArray(event.optimalTempRange) && <span className="inline-flex items-center gap-1"><Thermometer size={12} className="text-amber-600" />{event.optimalTempRange[0]}–{event.optimalTempRange[1]}°C</span>}
                      </div>
                      {event.weatherHazards && <p className="mt-2 text-[10px] leading-relaxed text-muted">{event.weatherHazards}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedEvents.length > 0 && <p className="mt-2 text-[10px] text-muted">{tp("localOnly")}</p>}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Leaf size={15} className="text-forest-600 dark:text-emerald-300" />
              <h3 className="text-xs font-bold text-ink">{tp("milestones")}</h3>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted">{tp("noMilestones")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {upcoming.map((event) => {
                  const taskId = `${event.id}:milestone`;
                  const done = Boolean(completed[taskId]);
                  return (
                    <li key={event.id} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleTask(taskId)}
                        aria-pressed={done}
                        aria-label={done ? tp("markUndone") : tp("markDone")}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${done ? "border-forest-600 bg-forest-600 text-white" : "border-line bg-surface text-transparent hover:border-forest-400"}`}
                      >
                        <Check size={12} />
                      </button>
                      <button type="button" onClick={() => selectDate(dateKey(event.start))} className="min-w-0 text-left hover:text-forest-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 rounded">
                        <p className={`text-[11px] font-semibold ${done ? "text-muted line-through" : "text-ink"}`}>{stageName(event)}</p>
                        <p className="font-mono text-[10px] text-muted">{shortDate(event.start)} · {tp("windowBegins")}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <CloudRain size={15} className="text-sky-600 dark:text-sky-300" />
              <h3 className="text-xs font-bold text-ink">{tp("weatherTitle")}</h3>
            </div>
            {weatherStatus === "loading" ? (
              <p role="status" className="mt-2 text-[11px] text-muted">{isBn ? "পূর্বাভাস লোড হচ্ছে…" : "Loading forecast…"}</p>
            ) : weatherStatus === "unavailable" || forecastDays.length === 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{tp("weatherUnavailable")}</p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-3 gap-2 px-2.5 text-[10px] font-semibold text-muted">
                  <span>{isBn ? "তারিখ" : "Date"}</span>
                  <span className="text-center">{isBn ? "বৃষ্টি" : "Rain"}</span>
                  <span className="text-right">{isBn ? "সর্বোচ্চ" : "High"}</span>
                </div>
                {forecastDays.map((day) => (
                  <button key={day.date} type="button" onClick={() => selectDate(day.date)} aria-pressed={selectedKey === day.date} className={`grid w-full grid-cols-3 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition ${selectedKey === day.date ? "border-forest-300 bg-forest-50 dark:bg-forest-950/30" : "border-transparent bg-surface-2/70 hover:border-forest-200"}`}>
                    <span className="font-mono text-muted">{day.date}</span>
                    <span className="text-center font-semibold text-ink">{Number.isFinite(day.precipitationSumMm) ? `${day.precipitationSumMm} mm` : "—"}</span>
                    <span className="text-right text-muted">{Number.isFinite(day.temperatureMaxC) ? `${day.temperatureMaxC}°C` : "—"}</span>
                  </button>
                ))}
                {weather?.meta?.isStale && <p className="text-[10px] text-amber-700">{tp("staleForecast")}</p>}
              </div>
            )}
            {alerts.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-line pt-2">
                {alerts.slice(0, 3).map((alert, index) => {
                  const isSevere = ["HIGH", "SEVERE"].includes(String(alert.severity || "").toUpperCase());
                  const tone = isSevere
                    ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200"
                    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200";
                  const title = isBn ? (alert.titleBn || alert.title || alert.category) : (alert.titleEn || alert.title || alert.category);
                  const description = isBn ? alert.descriptionBn : alert.descriptionEn;
                  return (
                    <div key={alert.id || `${alert.category || "alert"}-${index}`} className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed ${tone}`}>
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <div><p className="font-semibold">{title}</p>{description && <p className="mt-0.5 opacity-80">{description}</p>}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {alerts.length === 0 && weatherStatus === "ready" && <p className="mt-2 text-[10px] text-muted">{tp("noAlerts")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            {districtCal?.sourceDocumentUrl && (
              <a href={districtCal.sourceDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-forest-800 transition hover:bg-surface-2 dark:text-emerald-200">
                <Info size={14} />{tp("source")}
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/crop-rotation" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-forest px-2 text-[11px] font-semibold text-white transition hover:bg-forest/90">
                <Compass size={13} />{tp("rotation")}
              </Link>
              <Link href="/handoff" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-forest-300 bg-surface px-2 text-[11px] font-semibold text-forest-800 transition hover:bg-surface-2 dark:text-emerald-200">
                <CalendarDays size={13} />{tp("handoff")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
