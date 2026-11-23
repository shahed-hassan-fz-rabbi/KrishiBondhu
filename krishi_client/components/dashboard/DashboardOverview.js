"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CloudRain,
  Droplets,
  Map,
  MessageCircle,
  Sprout,
  Store,
  Sun,
  ThermometerSun,
} from "lucide-react";
import { ClimateMonthlyChart } from "@/components/charts/ClimateMonthlyChart.js";
import { MetricCard } from "@/components/ui/MetricCard.js";
import WeatherIntelligenceSection from "@/components/dashboard/WeatherIntelligenceSection.js";
import DashboardMarketPreview from "@/components/dashboard/DashboardMarketPreview.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useAuth } from "@/contexts/AuthContext.js";

const actions = [
  { href: "/my-farm", icon: Sprout, en: "My field", bn: "আমার ক্ষেত", detailEn: "Review your field records", detailBn: "ক্ষেতের তথ্য ও কাজ দেখুন" },
  { href: "/assistant", icon: MessageCircle, en: "Ask the assistant", bn: "সহকারীর পরামর্শ নিন", detailEn: "Continue with an agricultural question", detailBn: "কৃষি বিষয়ে প্রশ্ন করুন" },
  { href: "/market", icon: Store, en: "Market information", bn: "বাজার তথ্য", detailEn: "Browse available market records", detailBn: "বাজারদর ও লাভ হিসাব দেখুন" },
  { href: "/saved-advisories", icon: Bookmark, en: "Saved advisories", bn: "সংরক্ষিত পরামর্শ", detailEn: "Return to saved guidance", detailBn: "সংরক্ষিত পরামর্শ দেখুন" },
];

export default function DashboardOverview({
  available,
  metrics,
  years,
  chartSeries,
  wettest,
  driest,
  sources = [],
  district,
  districtName,
}) {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const isBn = locale === "bn";
  const number = (value) => new Intl.NumberFormat(isBn ? "bn-BD" : "en-GB").format(value);

  const averageTag = Number.isFinite(years) && years > 0
    ? (isBn ? `${number(years)} বছরের ঐতিহাসিক গড়` : `Historical average across ${number(years)} years`)
    : null;

  const tiles = [
    { key: "annualRainfall", value: metrics?.rainfall, unit: t("dashboardDesign.annualRainUnit"), icon: CloudRain, tone: "climate" },
    { key: "meanTemp", value: metrics?.temperature, unit: t("dashboardDesign.temperatureUnit"), icon: ThermometerSun, tone: "amber" },
    { key: "humidity", value: metrics?.humidity, unit: t("dashboardDesign.humidityUnit"), icon: Droplets, tone: "emerald" },
    { key: "solarRadiation", value: metrics?.solar, unit: t("dashboardDesign.solarUnit"), icon: Sun, tone: "amber" },
  ];

  const sourceKeys = [
    "nasa:power:daily:point",
    "nasa:smap:spl3smp_e:v006",
    "nasa:gpm:imerg:3imerghh:v07",
    "nasa:modis:mod13q1:v061",
  ];
  const coverage = sourceKeys.map((key) => sources.find((source) => source.datasetKey === key)).filter(Boolean);
  const latestCoverageDate = coverage.reduce((latest, source) => {
    const date = source.districtValidCoverage?.[district]?.lastObservationDate;
    return date && (!latest || date > latest) ? date : latest;
  }, null);


  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-6 pb-6">
      {/* Source-catalog observation dates are provenance, not a claim of live data. */}
      <section className="kb-freshness-strip flex flex-col gap-2 rounded-xl border border-line border-l-4 border-l-emerald bg-surface px-4 py-3 text-sm text-muted shadow-sm sm:flex-row sm:items-center sm:justify-between" role="region" aria-label={isBn ? "তথ্যের পর্যবেক্ষণ তারিখ" : "Data observation coverage"}>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest dark:text-emerald-300">{isBn ? "তথ্যের পর্যবেক্ষণ তারিখ" : "DATA OBSERVATION COVERAGE"}</p>
          <p className="mt-1 leading-5">{latestCoverageDate ? (isBn ? `উৎস তালিকায় সর্বশেষ পর্যবেক্ষণের তারিখ: ${latestCoverageDate}। প্রতিটি উৎসের সময়সীমা আলাদা হতে পারে।` : `Latest observation date listed in source coverage: ${latestCoverageDate}. Each source can have a different reporting period.`) : (isBn ? "উৎস তালিকায় পর্যবেক্ষণের তারিখ পাওয়া যায়নি।" : "Observation dates are unavailable in the source catalog.")}</p>
        </div>
        <Link href="/data-sources" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 font-semibold text-emerald hover:underline">{isBn ? "উৎস ও পদ্ধতি" : "Sources & methods"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </section>

      <section data-tour-target="dashboard.overview" className="kb-dash-context-card rounded-2xl border border-line bg-surface p-5 shadow-km-sm sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald">{isBn ? "আপনার কৃষি কর্মক্ষেত্র" : "YOUR FIELD WORKSPACE"}</p>
            <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-content sm:text-3xl">{isBn ? `${user?.name ? `${user.name}, ` : ""}আপনার কৃষি ড্যাশবোর্ড` : `${user?.name ? `Welcome, ${user.name}` : "Your agriculture dashboard"}`}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{isBn ? "নির্বাচিত এলাকার আবহাওয়া ও তারিখযুক্ত বাজার প্রতিবেদন দেখুন। ঐতিহাসিক জলবায়ু তথ্যকে বর্তমান পর্যবেক্ষণ থেকে আলাদা রাখা হয়েছে।" : "Review weather and dated market reports for your selected area. Historical climate context is kept separate from current observations."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium text-content"><Map className="h-4 w-4 text-emerald" aria-hidden="true" />{districtName || (isBn ? "এলাকা নির্বাচন করুন" : "Select a location")}</span>
              <Link href="/crop-calendar" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-content transition hover:border-emerald/40 hover:text-emerald">{isBn ? "ফসল ক্যালেন্ডার" : "Crop calendar"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link href="/crop-rotation" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-forest px-4 text-sm font-semibold text-white transition hover:bg-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald">{isBn ? "ফসল পরিকল্পনা" : "Plan crops"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </div>
          <aside className="rounded-xl border border-line bg-surface-2/60 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{isBn ? "পরিকল্পনার প্রেক্ষাপট" : "PLANNING CONTEXT"}</p>
            <p className="mt-2 text-sm leading-6 text-content">{isBn ? "এই সারাংশে স্বয়ংক্রিয়ভাবে মৌসুম বা জমির অবস্থা নির্ধারণ করা হয় না। ফসল ক্যালেন্ডার ও আমার ক্ষেত থেকে আপনার পরিকল্পনা বেছে নিন।" : "This overview does not infer a season or field condition. Choose a crop cycle in the calendar and manage field details in My Field."}</p>
            <Link href="/my-farm" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald hover:underline">{isBn ? "আমার ক্ষেত খুলুন" : "Open My Field"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </aside>
        </div>
      </section>

      {/* ============================================================
          5. WEATHER & MARKET INTELLIGENCE SECTIONS
          ============================================================ */}
      {district ? (
        <WeatherIntelligenceSection locationCode={district} locale={locale} compact />
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-surface p-5">
          <h2 className="font-semibold text-content">{isBn ? "আবহাওয়া ও সতর্কতা" : "Weather and alerts"}</h2>
          <p className="mt-1 text-sm text-muted">
            {isBn ? "এলাকা নির্বাচন করলে আবহাওয়ার তথ্য দেখানো হবে।" : "Select a location to load weather information."}
          </p>
        </section>
      )}

      <DashboardMarketPreview />

      {/* ============================================================
          6. HISTORICAL CLIMATE CONTEXT & CHARTS
          ============================================================ */}
      <section aria-labelledby="climate-summary" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">
              {isBn ? "ঐতিহাসিক প্রেক্ষাপট" : "HISTORICAL CONTEXT"}
            </p>
            <h2 id="climate-summary" className="mt-1 text-lg font-semibold text-content">
              {isBn ? "জলবায়ুর দীর্ঘমেয়াদি চিত্র" : "Long-term climate overview"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {isBn ? "এগুলো বর্তমান আবহাওয়া নয়; ঐতিহাসিক জলবায়ু গড়।" : "Historical climate averages, not current weather observations."}
            </p>
          </div>
          <Link href="/climate" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald hover:underline">
            {isBn ? "সব জলবায়ু তথ্য" : "All climate data"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {available ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("dashboard.metricsTitle")}>
              {tiles.filter(({ value }) => value !== "—").map(({ key, value, unit, icon, tone }) => <MetricCard key={key} variant="dashboard" className="min-h-[124px] !p-4 sm:!p-4" label={t(`dashboard.${key}`)} value={isBn ? String(value).replace(/[0-9]/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]) : value} unit={unit} icon={icon} tone={tone} />)}
            </div>
            {averageTag && (
              <p className="-mt-2 text-xs text-muted">
                {averageTag}
                {latestCoverageDate ? ` · ${isBn ? "সর্বশেষ কভারেজ" : "Latest source coverage"}: ${latestCoverageDate}` : ""}
              </p>
            )}
            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)]">
              <article className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-km-sm sm:p-5">
                <h3 className="mb-3 text-base font-semibold text-content">{t("dashboardDesign.rainfallTitle")}</h3>
                <ClimateMonthlyChart
                  data={chartSeries}
                  variant="compact"
                  title={t("dashboardDesign.rainfallTitle")}
                  meanLabel={t("dashboardDesign.meanRain")}
                  medianLabel={t("dashboardDesign.medianRain")}
                  emptyMessage={t("rotation.unavailable")}
                  monsoonLabel={t("dashboardUi.monsoonLabel")}
                />
              </article>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[{ key: "wettest", row: wettest }, { key: "driest", row: driest }]
                  .filter(({ row }) => row && row.value !== "—")
                  .map(({ key, row }) => (
                    <article key={key} className="flex flex-col justify-center rounded-2xl border border-line bg-surface p-4 shadow-km-sm">
                      <p className="text-xs text-muted">{averageTag}</p>
                      <h3 className="mt-1 text-sm font-semibold text-content">{t(`dashboardDesign.${key}`).replace("{month}", row.month)}</h3>
                      <p className="mt-2 text-2xl font-semibold text-content">
                        {number(row.value)} <span className="text-sm font-normal text-muted">{t("dashboardDesign.rainUnit")}</span>
                      </p>
                    </article>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
            <p className="font-medium text-content">{isBn ? "ঐতিহাসিক জলবায়ু তথ্য পাওয়া যায়নি" : "Historical climate data is unavailable"}</p>
            <p className="mt-1 text-sm text-muted">{isBn ? "এই এলাকার জন্য যাচাইকৃত তথ্য পাওয়া গেলে এখানে দেখানো হবে।" : "Verified information will appear here when available for this area."}</p>
          </div>
        )}
      </section>

      {/* ============================================================
          7. QUICK ACCESS SERVICES
          ============================================================ */}
      <section aria-labelledby="dashboard-shortcuts" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">{isBn ? "দ্রুত কাজ" : "QUICK ACCESS"}</p>
          <h2 id="dashboard-shortcuts" className="mt-1 text-lg font-semibold text-content">{isBn ? "আপনার প্রয়োজনীয় সেবা" : "Go to a service"}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map(({ href, icon: Icon, en, bn, detailEn, detailBn }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-[104px] items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-km-sm transition hover:-translate-y-0.5 hover:border-emerald/40 hover:shadow-km-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald/10 text-emerald">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-content">{isBn ? bn : en}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">{isBn ? detailBn : detailEn}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-emerald" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
