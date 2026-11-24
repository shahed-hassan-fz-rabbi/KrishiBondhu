"use client";

import { CloudSun, MapPin } from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { getDistrictReferencePoint } from "@/lib/districtGeography.js";

export default function DistrictLocationPanel({ district, locale }) {
  const { t } = useLang();
  const point = getDistrictReferencePoint(district);
  const districtName = (locale === "bn" ? district?.nameBn || district?.nameEn : district?.nameEn) || t("dashboardUi.selectedDistrict");

  return (
    <section aria-labelledby="district-location-heading" className="relative isolate overflow-hidden rounded-3xl border border-emerald-800/70 bg-gradient-to-br from-[#0b3f2c] via-[#155c3b] to-[#0a3427] p-6 shadow-km-md sm:p-8 dark:border-emerald-800/70">
      {/* Faint world climate map layered into the background of the location card. */}
      <div aria-hidden="true" className="kb-district-map-overlay pointer-events-none absolute inset-y-0 right-0 -z-10 w-full" />
      <div className="sr-only">
        Scoped to Cumilla and Chattogram. The reference point is not your exact farm location.
        {point && `Coordinate: ${point.latitude}, ${point.longitude}`}
      </div>
      <div className="relative z-10 max-w-xl">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-emerald-50 ring-1 ring-white/25 backdrop-blur-sm"><CloudSun className="h-8 w-8" aria-hidden="true" /></div>
        <p className="text-sm font-medium text-emerald-100/90">{t("dashboardUi.areaClimate")}</p>
        <h2 id="district-location-heading" className="mt-2 flex items-center gap-2 text-3xl font-bold text-white sm:text-4xl"><MapPin className="h-6 w-6 shrink-0" aria-hidden="true" />{districtName}</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-emerald-50/85">{t("dashboardUi.areaClimateIntro")}</p>
      </div>
      {/* Light white wash softens the map without covering its detail. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-white/[0.07]" />
    </section>
  );
}
