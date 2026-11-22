"use client";

import Link from "next/link";
import { ArrowRight, Bookmark, CloudRain, Droplets, Map, MessageCircle, Sprout, Sun, ThermometerSun } from "lucide-react";
import { ClimateMonthlyChart } from "@/components/charts/ClimateMonthlyChart.js";
import { MetricCard } from "@/components/ui/MetricCard.js";
import WeatherIntelligenceSection from "@/components/dashboard/WeatherIntelligenceSection.js";
import DashboardMarketPreview from "@/components/dashboard/DashboardMarketPreview.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { useAuth } from "@/contexts/AuthContext.js";

const actions = [
  { href: "/my-farm", icon: Sprout, en: "My farm", bn: "আমার খামার", detailEn: "Review your farm records", detailBn: "খামারের তথ্য দেখুন" },
  { href: "/assistant", icon: MessageCircle, en: "Ask the assistant", bn: "সহকারীর পরামর্শ নিন", detailEn: "Continue with an agricultural question", detailBn: "কৃষি বিষয়ে প্রশ্ন করুন" },
  { href: "/market", icon: ArrowRight, en: "Market information", bn: "বাজার তথ্য", detailEn: "Browse available market records", detailBn: "বাজারের তথ্য দেখুন" },
  { href: "/saved-advisories", icon: Bookmark, en: "Saved advisories", bn: "সংরক্ষিত পরামর্শ", detailEn: "Return to saved guidance", detailBn: "সংরক্ষিত পরামর্শ দেখুন" },
];

export default function DashboardOverview({ available, metrics, years, chartSeries, wettest, driest, sources, district, districtName }) {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const isBn = locale === "bn";
  const number = (value) => new Intl.NumberFormat(isBn ? "bn-BD" : "en-GB").format(value);
  const averageTag = Number.isFinite(years) && years > 0
    ? (isBn ? `${number(years)} বছরের ঐতিহাসিক গড়` : `Historical average across ${number(years)} years`)
    : null;
  const tiles = [
    { key: "annualRainfall", value: metrics.rainfall, unit: t("dashboardDesign.annualRainUnit"), icon: CloudRain, tone: "climate" },
    { key: "meanTemp", value: metrics.temperature, unit: t("dashboardDesign.temperatureUnit"), icon: ThermometerSun, tone: "amber" },
    { key: "humidity", value: metrics.humidity, unit: t("dashboardDesign.humidityUnit"), icon: Droplets, tone: "emerald" },
    { key: "solarRadiation", value: metrics.solar, unit: t("dashboardDesign.solarUnit"), icon: Sun, tone: "amber" },
  ];
  const sourceKeys = ["nasa:power:daily:point", "nasa:smap:spl3smp_e:v006", "nasa:gpm:imerg:3imerghh:v07", "nasa:modis:mod13q1:v061"];
  const coverage = sourceKeys.map((key) => sources.find((source) => source.datasetKey === key)).filter(Boolean);
  const latestCoverageDate = coverage.reduce((latest, source) => {
    const date = source.districtValidCoverage?.[district]?.lastObservationDate;
    return date && (!latest || date > latest) ? date : latest;
  }, null);

  return <div className="mx-auto w-full max-w-[1200px] space-y-7 pb-2">
    <header className="relative overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-br from-[#0d4a34] via-[#176341] to-[#74a65a] px-5 py-7 text-white shadow-km-md sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[34px] border-white/10" />
      <div className="relative max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">{isBn ? "কৃষিবন্ধু · কৃষি কর্মক্ষেত্র" : "KrishiBondhu · Your farm workspace"}</p>
        <h1 data-tour-target="dashboard.overview" className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{isBn ? `${user?.name ? `${user.name}, ` : ""}আপনার কৃষি ড্যাশবোর্ড` : `${user?.name ? `Welcome, ${user.name}` : "Your agriculture dashboard"}`}</h1>
        <p className="mt-2 text-sm leading-6 text-white/85">{isBn ? "আবহাওয়া, ঐতিহাসিক জলবায়ু তথ্য ও কৃষি সেবাগুলো এক জায়গায় দেখুন।" : "A clear view of weather, historical climate context, and your agricultural services."}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-medium"><Map className="h-4 w-4" aria-hidden="true" />{districtName || "—"}</span>
          <Link href="/crop-rotation" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-forest transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{isBn ? "ফসল পরিকল্পনা" : "Plan a crop rotation"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          <Link href="/climate" className="inline-flex min-h-10 items-center rounded-xl border border-white/35 px-4 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{isBn ? "জলবায়ু তথ্য" : "Explore climate data"}</Link>
        </div>
      </div>
    </header>

    <section aria-labelledby="dashboard-shortcuts" className="space-y-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">{isBn ? "দ্রুত কাজ" : "QUICK ACCESS"}</p><h2 id="dashboard-shortcuts" className="mt-1 text-lg font-semibold text-content">{isBn ? "আপনার প্রয়োজনীয় সেবা" : "Go to a service"}</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ href, icon: Icon, en, bn, detailEn, detailBn }) => <Link key={href} href={href} className="group flex min-h-[104px] items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-km-sm transition hover:-translate-y-0.5 hover:border-emerald/40 hover:shadow-km-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald/10 text-emerald"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-content">{isBn ? bn : en}</span><span className="mt-1 block text-xs leading-5 text-muted">{isBn ? detailBn : detailEn}</span></span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-emerald" aria-hidden="true" />
        </Link>)}
      </div>
    </section>

    {district ? <WeatherIntelligenceSection locationCode={district} locale={locale} compact /> : <section className="rounded-2xl border border-dashed border-line bg-surface p-5"><h2 className="font-semibold text-content">{isBn ? "আবহাওয়া ও সতর্কতা" : "Weather and alerts"}</h2><p className="mt-1 text-sm text-muted">{isBn ? "এলাকা নির্বাচন করলে আবহাওয়ার তথ্য দেখানো হবে।" : "Select a location to load weather information."}</p></section>}
    <DashboardMarketPreview />

    <section aria-labelledby="climate-summary" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">{isBn ? "ঐতিহাসিক প্রেক্ষাপট" : "HISTORICAL CONTEXT"}</p><h2 id="climate-summary" className="mt-1 text-lg font-semibold text-content">{isBn ? "জলবায়ুর দীর্ঘমেয়াদি চিত্র" : "Long-term climate overview"}</h2><p className="mt-1 text-sm text-muted">{isBn ? "এগুলো বর্তমান আবহাওয়া নয়; ঐতিহাসিক জলবায়ু গড়।" : "Historical climate averages, not current weather observations."}</p></div><Link href="/climate" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald hover:underline">{isBn ? "সব জলবায়ু তথ্য" : "All climate data"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
      {available ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("dashboard.metricsTitle")}>
          {tiles.filter(({ value }) => value !== "—").map(({ key, value, unit, icon, tone }) => <MetricCard key={key} variant="dashboard" className="min-h-[124px] !p-4 sm:!p-4" label={t(`dashboard.${key}`)} value={isBn ? String(value).replace(/[0-9]/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]) : value} unit={unit} icon={icon} tone={tone} />)}
        </div>
        {averageTag && <p className="-mt-2 text-xs text-muted">{averageTag}{latestCoverageDate ? ` · ${isBn ? "সর্বশেষ কভারেজ" : "Latest source coverage"}: ${latestCoverageDate}` : ""}</p>}
        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)]">
          <article className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-km-sm sm:p-5"><h3 className="mb-3 text-base font-semibold text-content">{t("dashboardDesign.rainfallTitle")}</h3><ClimateMonthlyChart data={chartSeries} variant="compact" title={t("dashboardDesign.rainfallTitle")} meanLabel={t("dashboardDesign.meanRain")} medianLabel={t("dashboardDesign.medianRain")} emptyMessage={t("rotation.unavailable")} monsoonLabel={t("dashboardUi.monsoonLabel")} /></article>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{[{ key: "wettest", row: wettest }, { key: "driest", row: driest }].filter(({ row }) => row.value !== "—").map(({ key, row }) => <article key={key} className="flex flex-col justify-center rounded-2xl border border-line bg-surface p-4 shadow-km-sm"><p className="text-xs text-muted">{averageTag}</p><h3 className="mt-1 text-sm font-semibold text-content">{t(`dashboardDesign.${key}`).replace("{month}", row.month)}</h3><p className="mt-2 text-2xl font-semibold text-content">{number(row.value)} <span className="text-sm font-normal text-muted">{t("dashboardDesign.rainUnit")}</span></p></article>)}</div>
        </div>
      </> : <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center"><p className="font-medium text-content">{isBn ? "ঐতিহাসিক জলবায়ু তথ্য পাওয়া যায়নি" : "Historical climate data is unavailable"}</p><p className="mt-1 text-sm text-muted">{isBn ? "এই এলাকার জন্য যাচাইকৃত তথ্য পাওয়া গেলে এখানে দেখানো হবে।" : "Verified information will appear here when available for this area."}</p></div>}
    </section>

    <section aria-labelledby="dashboard-data-sources" className="rounded-2xl border border-line bg-surface p-4 shadow-km-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald">{isBn ? "উৎস ও সতেজতা" : "SOURCES & FRESHNESS"}</p><h2 id="dashboard-data-sources" className="mt-1 text-base font-semibold text-content">{isBn ? "তথ্যের পরিধি" : "Data coverage"}</h2></div><Link href="/data-sources" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald hover:underline">{isBn ? "উৎস দেখুন" : "Review sources"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div><p className="mt-2 text-sm leading-6 text-muted">{latestCoverageDate ? (isBn ? `উৎস তালিকায় সর্বশেষ পর্যবেক্ষণের তারিখ ${latestCoverageDate}। প্রতিটি উপাত্তের নিজস্ব তারিখ ও পদ্ধতি দেখুন।` : `Latest observation date listed in available source coverage: ${latestCoverageDate}. Each dataset has its own date and method.`) : (isBn ? "উৎসের পর্যবেক্ষণ তারিখ লোড করা যায়নি।" : "Observation dates are not currently available from the source catalog.")}</p></section>
  </div>;
}
