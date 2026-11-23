"use client";

import { useState } from "react";
import {
  Phone,
  Mail,
  Globe,
  MapPin,
  Building2,
  Headphones,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { getUpazilasForDistrict } from "@/lib/upazilas.js";
import { getAgriSupportContacts, DISTRICT_DAE_OFFICES } from "@/lib/officialAgriContacts.js";

export function OfficialAgriContacts({ defaultDistrict = "chattogram", defaultUpazila = "" }) {
  const { locale } = useLang();
  const bn = locale === "bn";

  const [selectedDistrict, setSelectedDistrict] = useState(defaultDistrict || "chattogram");
  const upazilas = getUpazilasForDistrict(selectedDistrict);
  const [selectedUpazila, setSelectedUpazila] = useState(
    defaultUpazila || (upazilas[0]?.code || "")
  );

  const contactData = getAgriSupportContacts(selectedDistrict, selectedUpazila);
  const { national, district, upazila, isUpazilaVerified } = contactData;

  const currentUpazilaObj = upazilas.find(
    (u) =>
      u.code === selectedUpazila ||
      u.nameEn.toLowerCase() === selectedUpazila.toLowerCase() ||
      u.nameBn === selectedUpazila
  );

  return (
    <section aria-labelledby="official-contacts-heading" className="mt-10">
      {/* Section Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-forest/10 text-forest dark:bg-emerald/15 dark:text-emerald">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald dark:text-emerald-400">
              {bn ? "সরকারি কৃষি সম্প্রসারণ অধিদপ্তর (ডিএই)" : "OFFICIAL GOVERNMENT DAE DIRECTORY"}
            </span>
          </div>
          <h2 id="official-contacts-heading" className="mt-1.5 text-xl font-bold tracking-tight text-content sm:text-2xl">
            {bn ? "সরকারি কৃষি সহায়তা ও অফিস যোগাযোগ" : "Official Agricultural Support Contacts"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted leading-relaxed">
            {bn
              ? "কৃষি সম্প্রসারণ অধিদপ্তর (ডিএই) এবং কৃষি মন্ত্রণালয়ের উন্মুক্ত ও সরকারি পোর্টাল থেকে সংগৃহীত যাচাইকৃত যোগাযোগের তথ্য।"
              : "Authentic, publicly verified contact details for Department of Agricultural Extension (DAE) offices in Bangladesh."}
          </p>
        </div>

        {/* Location Picker */}
        <div className="flex flex-wrap items-center gap-2">
          {/* District Picker */}
          <div>
            <label htmlFor="agri-contact-district" className="sr-only">
              {bn ? "জেলা নির্বাচন" : "Select District"}
            </label>
            <select
              id="agri-contact-district"
              value={selectedDistrict}
              onChange={(e) => {
                const nextDist = e.target.value;
                setSelectedDistrict(nextDist);
                const nextUpzList = getUpazilasForDistrict(nextDist);
                setSelectedUpazila(nextUpzList[0]?.code || "");
              }}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-content focus:border-emerald focus:outline-none"
            >
              <option value="chattogram">{bn ? "চট্টগ্রাম জেলা" : "Chattogram District"}</option>
              <option value="cumilla">{bn ? "কুমিল্লা জেলা" : "Cumilla District"}</option>
            </select>
          </div>

          {/* Upazila Picker */}
          <div>
            <label htmlFor="agri-contact-upazila" className="sr-only">
              {bn ? "উপজেলা নির্বাচন" : "Select Upazila"}
            </label>
            <select
              id="agri-contact-upazila"
              value={selectedUpazila}
              onChange={(e) => setSelectedUpazila(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-content focus:border-emerald focus:outline-none"
            >
              {upazilas.map((u) => (
                <option key={u.code} value={u.code}>
                  {bn ? u.nameBn : u.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Trust & Provenance Badge */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald/20 bg-emerald/5 px-3.5 py-2 text-[11px] text-content">
        <ShieldCheck className="h-4 w-4 text-emerald shrink-0" />
        <span>
          {bn
            ? "সকল তথ্য কৃষি সম্প্রসারণ অধিদপ্তর (dae.gov.bd) এবং জেলা বাতায়ন থেকে সংগৃহীত। কোনো অনুমাননির্ভর তথ্য রাখা হয়নি।"
            : "All telephone numbers, addresses, and official web portals are verified against public records from DAE Bangladesh. No speculative contacts are shown."}
        </span>
      </div>

      {/* Contacts Grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Card 1: Upazila Agriculture Office (Local) */}
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-km-sm">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-forest dark:text-forest-300">
                {bn ? "উপজেলা কৃষি অফিস (মাঠপর্যায়)" : "Local Upazila Office"}
              </span>
              {isUpazilaVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-strong dark:text-emerald">
                  <CheckCircle2 className="h-3 w-3" />
                  {bn ? "যাচাইকৃত" : "Verified DAE"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                  {bn ? "উপজেলা সদর" : "Subdistrict"}
                </span>
              )}
            </div>

            {isUpazilaVerified && upazila ? (
              <div className="mt-4 space-y-3">
                <h3 className="text-base font-bold text-content leading-snug">
                  {bn ? upazila.officeNameBn : upazila.officeNameEn}
                </h3>

                <p className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                  <MapPin className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  <span>{bn ? upazila.addressBn : upazila.addressEn}</span>
                </p>

                <div className="space-y-2 pt-2 border-t border-line/60">
                  {upazila.phone && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="h-3.5 w-3.5 text-forest shrink-0" />
                      <a
                        href={`tel:${upazila.phone.replace(/[^0-9+]/g, "")}`}
                        className="font-semibold text-content hover:text-emerald transition-colors"
                      >
                        {upazila.phone}
                      </a>
                      <span className="text-[10px] text-muted">({bn ? "টেলিফোন" : "Landline"})</span>
                    </div>
                  )}

                  {upazila.mobileOfficial && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="h-3.5 w-3.5 text-emerald shrink-0" />
                      <a
                        href={`tel:${upazila.mobileOfficial.replace(/[^0-9+]/g, "")}`}
                        className="font-semibold text-content hover:text-emerald transition-colors"
                      >
                        {upazila.mobileOfficial}
                      </a>
                      <span className="text-[10px] text-muted">({bn ? "অফিসিয়াল মোবাইল" : "Mobile"})</span>
                    </div>
                  )}

                  {upazila.email && (
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="h-3.5 w-3.5 text-muted shrink-0" />
                      <a
                        href={`mailto:${upazila.email}`}
                        className="truncate text-content hover:text-emerald transition-colors"
                      >
                        {upazila.email}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Honest Empty State for Upazila Direct Line */
              <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-2/40 p-4 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-muted" />
                <h4 className="mt-2 text-xs font-bold text-content">
                  {bn
                    ? `${currentUpazilaObj?.nameBn || "এই উপজেলা"}-এর সরাসরি ল্যান্ডলাইন ইনডেক্সিং প্রক্রিয়াধীন`
                    : `Direct phone line for ${currentUpazilaObj?.nameEn || "this upazila"} is pending verification`}
                </h4>
                <p className="mt-1 text-[11px] text-muted leading-relaxed">
                  {bn
                    ? "সরাসরি মাঠ সহায়তার জন্য অনুগ্রহ করে জেলা উপপরিচালকের কার্যালয় অথবা জাতীয় কল সেন্টার ১৬১২৩-এ যোগাযোগ করুন।"
                    : "To prevent misinformation, unindexed numbers are not shown. Please consult the verified District DAE Office or call 16123."}
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-line/60">
            {upazila?.website ? (
              <a
                href={upazila.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-forest-700 dark:text-emerald"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{bn ? "উপজেলা বাতায়ন ভিজিট করুন" : "Visit Upazila Portal"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <a
                href={`https://${selectedDistrict === "cumilla" ? "comilla" : "chittagong"}.gov.bd`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-content"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{bn ? "জেলা বাতায়ন দেখুন" : "District Web Portal"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Card 2: District DAE Headquarters */}
        {district && (
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-km-sm">
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-forest dark:text-forest-300">
                  {bn ? "জেলা কার্যালয়" : "District DAE Office"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-strong dark:text-emerald">
                  <CheckCircle2 className="h-3 w-3" />
                  {bn ? "প্রত্যয়িত" : "Verified"}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <h3 className="text-base font-bold text-content leading-snug">
                  {bn ? district.officeNameBn : district.officeNameEn}
                </h3>

                <p className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                  <MapPin className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  <span>{bn ? district.addressBn : district.addressEn}</span>
                </p>

                <div className="space-y-2 pt-2 border-t border-line/60">
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-forest shrink-0" />
                    <a
                      href={`tel:${district.phone.replace(/[^0-9+]/g, "")}`}
                      className="font-semibold text-content hover:text-emerald transition-colors"
                    >
                      {district.phone}
                    </a>
                    <span className="text-[10px] text-muted">({bn ? "অফিস টেলিফোন" : "Office Phone"})</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted shrink-0" />
                    <a
                      href={`mailto:${district.email}`}
                      className="truncate text-content hover:text-emerald transition-colors"
                    >
                      {district.email}
                    </a>
                  </div>
                </div>

                {/* District Services */}
                <div className="pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    {bn ? "মূল সরকারি দায়িত্ব:" : "Key Mandates:"}
                  </span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                    {(bn ? district.servicesBn : district.servicesEn).map((srv, idx) => (
                      <li key={idx}>{srv}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-line/60">
              <a
                href={district.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-forest-700 dark:text-emerald"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{bn ? "জেলা ডিএই ওয়েবসাইট" : "Official District DAE Site"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* Card 3: National Agriculture Helpline & DAE HQ */}
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-km-sm">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald dark:text-emerald-400">
                {bn ? "জাতীয় হটলাইন ও সদর দপ্তর" : "National DAE & Helpline"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest dark:text-forest-300">
                {bn ? "টোল ফ্রি / ১৬১২৩" : "Govt. Hotline 16123"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {/* Highlight Call Center Box */}
              <div className="rounded-xl border border-emerald/30 bg-emerald/10 p-3 text-center">
                <Headphones className="mx-auto h-6 w-6 text-emerald" />
                <p className="mt-1 text-xs font-bold text-forest dark:text-emerald">
                  {bn ? national.hotlineLabelBn : national.hotlineLabelEn}
                </p>
                <a
                  href={`tel:${national.hotline}`}
                  className="mt-1 inline-block text-2xl font-extrabold tracking-tight text-content hover:text-emerald transition-colors"
                >
                  {national.hotline}
                </a>
                <p className="text-[10px] text-muted mt-0.5">
                  {bn ? "যেকোনো মোবাইল অপারেটর থেকে ডায়াল করুন" : "Accessible from all national telecom operators"}
                </p>
              </div>

              <div className="pt-2 text-xs">
                <h4 className="font-bold text-content">
                  {bn ? national.officeNameBn : national.officeNameEn}
                </h4>
                <p className="mt-1 text-muted text-[11px] leading-relaxed">
                  {bn ? national.addressBn : national.addressEn}
                </p>
                <p className="mt-1 text-muted text-[11px]">
                  {bn ? national.operatingHoursBn : national.operatingHoursEn}
                </p>
              </div>

              <div className="space-y-1.5 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted shrink-0" />
                  <span className="text-content font-medium">{national.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted shrink-0" />
                  <a href={`mailto:${national.email}`} className="text-content hover:text-emerald">
                    {national.email}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-line/60">
            <a
              href={national.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:text-forest-700 dark:text-emerald"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{bn ? "ডিএই কেন্দ্রীয় পোর্টাল" : "dae.gov.bd"}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
