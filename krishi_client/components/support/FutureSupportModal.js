"use client";

import { useEffect, useState } from "react";
import {
  X,
  BadgeCheck,
  Users,
  Share2,
  FileCheck2,
  Sparkles,
  CalendarCheck,
  Lock,
  ArrowRight,
  ShieldAlert,
  Info,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";

const UPCOMING_FEATURES = [
  {
    id: "officer_accounts",
    titleEn: "Verified Agricultural Officer Accounts",
    titleBn: "সরকারি কর্মকর্তা ভেরিফিকেশন ও পরিচিতি",
    descEn:
      "Official BCS (Agriculture) cadre and DAE employee validation with union/upazila assignment badges, verified government credentials, and trusted identities.",
    descBn:
      "বিসিএস (কৃষি) ক্যাডার ও ডিএই কর্মকর্তাদের সরকারি পরিচয়পত্র ও পদায়ন যাচাইকৃত ব্যাজ, যা কৃষকের সাথে যোগাযোগের সর্বোচ্চ নির্ভরযোগ্যতা নিশ্চিত করবে।",
    icon: BadgeCheck,
    tagEn: "Security & Trust",
    tagBn: "নিরাপত্তা ও প্রত্যয়ন",
    tone: "emerald",
  },
  {
    id: "farmer_officer_connection",
    titleEn: "Farmer–Officer Connection",
    titleBn: "কৃষক-কর্মকর্তা সরাসরি সংযোগ",
    descEn:
      "Automated geographic matching connecting farmers directly with their local Sub-Assistant Agriculture Officer (SAAO) and Upazila Agriculture Officer (UAO).",
    descBn:
      "ব্লক ও ইউনিয়নভিত্তিক অটোমেটেড রাউটিংয়ের মাধ্যমে সরাসরি দায়িত্বপ্রাপ্ত উপসহকারী কৃষি কর্মকর্তা (এসএএও) ও উপজেলা কর্মকর্তার সাথে বার্তা আদান-প্রদান।",
    icon: Users,
    tagEn: "Collaboration",
    tagBn: "সরাসরি যোগাযোগ",
    tone: "forest",
  },
  {
    id: "farm_profile_sharing",
    titleEn: "Virtual Farm Profile Sharing",
    titleBn: "ভার্চুয়াল খামার প্রোফাইল ও ইতিহাস শেয়ার",
    descEn:
      "Secure, consent-based 1-click sharing of your farm's soil moisture logs, past crop rotations, and satellite vegetation index with visiting officers.",
    descBn:
      "আপনার অনুমতি নিয়ে খামারের মাটির আর্দ্রতা, পূর্ববর্তী ফসলের ইতিহাস এবং উপগ্রহ এনডিভিআই সূচক সরাসরি কর্মকর্তার কাছে শেয়ারের সুবিধা।",
    icon: Share2,
    tagEn: "Data Interoperability",
    tagBn: "তথ্য আদান-প্রদান",
    tone: "blue",
  },
  {
    id: "online_crop_plan_review",
    titleEn: "Online Crop Plan Review",
    titleBn: "অনলাইন ফসল পরিকল্পনা যৌথ মূল্যায়ন",
    descEn:
      "Interactive co-planning canvas allowing officers to review proposed sowing windows, annotate seed varieties, and flag micro-climatic constraints in real time.",
    descBn:
      "কৃষকের প্রস্তাবিত বীজ বপন ও সারের পরিকল্পনা ইন্টারঅ্যাক্টিভভাবে যৌথ পর্যালোচনা করে স্থানীয় জলবায়ুর সাথে মানানসই সংশোধনী প্রদান।",
    icon: FileCheck2,
    tagEn: "Agronomic Review",
    tagBn: "পরিকল্পনা মূল্যায়ন",
    tone: "amber",
  },
  {
    id: "personalized_advisory",
    titleEn: "Personalized Agricultural Advisory",
    titleBn: "মাঠ ও জলবায়ুভিত্তিক ব্যক্তিগত পরামর্শ",
    descEn:
      "Hybrid intelligence merging NASA satellite observations and BAMIS crop calendars with local officer field diagnostics tailored to your plot.",
    descBn:
      "নাসা উপগ্রহের বৃষ্টিপাত ও মাটির আর্দ্রতা তথ্যের সাথে স্থানীয় কর্মকর্তার বাস্তব মাঠ অভিজ্ঞতার সমন্বয়ে কাস্টমাইজড কৃষি প্রেসক্রিপশন।",
    icon: Sparkles,
    tagEn: "Smart Guidance",
    tagBn: "স্মার্ট প্রেসক্রিপশন",
    tone: "purple",
  },
  {
    id: "direct_consultation_followup",
    titleEn: "Direct Consultation & Follow-up",
    titleBn: "দ্বিমুখী ফলো-আপ ও মাঠ পরিদর্শন শিডিউল",
    descEn:
      "Closed-loop tracking for treatment outcomes, pest re-evaluation milestones, and request scheduling for in-person DAE field visits.",
    descBn:
      "প্রদত্ত পরামর্শের কার্যকারিতা পর্যবেক্ষণ, রোগ নিরাময়ের ফলো-আপ তারিখ নির্ধারণ এবং প্রয়োজনে সরকারি কর্মকর্তার মাঠ পরিদর্শনের অনুরোধ শিডিউল।",
    icon: CalendarCheck,
    tagEn: "Action & Resolution",
    tagBn: "মাঠ ফলো-আপ",
    tone: "forest",
  },
];

export function FutureSupportModal({ isOpen, onClose }) {
  const { locale } = useLang();
  const bn = locale === "bn";

  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
        {/* Modal Top Bar */}
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald/15 px-2.5 py-0.5 text-xs font-bold text-emerald-strong dark:text-emerald">
                <Clock className="h-3.5 w-3.5" />
                {bn ? "আসন্ন ফিচারসমূহ (Coming Soon)" : "Roadmap Preview · Phase 2"}
              </span>
              <span className="text-xs text-muted">
                {bn ? "ডিএই অংশীদারিত্ব মডেল" : "DAE Digital Ecosystem"}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-content sm:text-3xl">
              {bn
                ? "ভবিষ্যৎ কৃষি সম্প্রসারণ ও কর্মকর্তা পোর্টাল"
                : "Future Agricultural Support & Officer Portal"}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-muted max-w-2xl leading-relaxed">
              {bn
                ? "বাংলাদেশের প্রত্যন্ত অঞ্চলের কৃষকদের সাথে কৃষি সম্প্রসারণ অধিদপ্তরের (ডিএই) প্রত্যয়িত কর্মকর্তাদের সরাসরি দ্বি-পাক্ষিক ডিজিটাল সংযোগের পরিকল্পনা।"
                : "A preview of the next-generation digital ecosystem designed to connect verified field officers directly with KrishiBondhu farmers."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-content transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Informational Architecture Banner */}
        <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-forest shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-content">
              <p className="font-semibold text-content">
                {bn ? "পরিকল্পিত ভবিষ্যৎ সংস্করণ নির্দেশিকা" : "Architectural Preview Notice"}
              </p>
              <p className="mt-0.5 text-muted">
                {bn
                  ? "এই ফিচারগুলো কৃষিবন্ধুর ভবিষ্যৎ সংস্করণের রোডম্যাপে অন্তর্ভুক্ত। বর্তমান সংস্করণে পরামর্শ রেকর্ডগুলো কৃষকের নিজস্ব একাউন্টে সংরক্ষিত হচ্ছে এবং সাধারণ অ্যাডমিন/অফিসার কিউয়ের মাধ্যমে প্রক্রিয়াজাত করা হয়।"
                  : "These capabilities represent planned architectural milestones. In the current release, all consultation records are securely persisted for the authenticated farmer and routed through the standard review queue."}
              </p>
            </div>
          </div>
        </div>

        {/* Feature Grid: 6 Planned Features */}
        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
            {bn ? "আসন্ন ৬টি প্রধান উদ্ভাবন ও ফিচার" : "6 Planned Core Enhancements"}
          </h3>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {UPCOMING_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-km-sm transition-all hover:border-emerald/40 hover:shadow-km-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10 text-forest dark:bg-emerald/15 dark:text-emerald">
                        <Icon className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold text-muted">
                        {bn ? "শীঘ্রই আসছে" : "Coming Soon"}
                      </span>
                    </div>

                    <h4 className="mt-3 text-sm font-bold text-content leading-snug">
                      {bn ? feat.titleBn : feat.titleEn}
                    </h4>

                    <p className="mt-1.5 text-xs text-muted leading-relaxed">
                      {bn ? feat.descBn : feat.descEn}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-forest dark:text-emerald">
                      {bn ? feat.tagBn : feat.tagEn}
                    </span>
                    <Lock className="h-3 w-3 text-muted" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interactive Future Workflow Walkthrough */}
        <div className="mt-7 rounded-2xl border border-line bg-surface-2/40 p-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-content">
            {bn ? "ভবিষ্যৎ দ্বিমুখী ওয়ার্কফ্লো রূপরেখা" : "Anticipated Farmer–Officer Workflow"}
          </h4>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest dark:text-emerald">
                ১
              </span>
              <p className="mt-2 text-xs font-bold text-content">
                {bn ? "১. মাঠ পর্যবেক্ষণ" : "1. Field Logging"}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {bn ? "কৃষক লক্ষণ ও মাটির ডেটা অ্যাপে যুক্ত করেন" : "Farmer records crop issue & plot data"}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest dark:text-emerald">
                ২
              </span>
              <p className="mt-2 text-xs font-bold text-content">
                {bn ? "২. কর্মকর্তা রাউটিং" : "2. Officer Matching"}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {bn ? "স্থানীয় উপসহকারী কর্মকর্তার ড্যাশবোর্ডে নোটিফিকেশন" : "Direct notification to assigned SAAO"}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest dark:text-emerald">
                ৩
              </span>
              <p className="mt-2 text-xs font-bold text-content">
                {bn ? "৩. সমন্বিত পরামর্শ" : "3. Verified Review"}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {bn ? "উপগ্রহ ডেটাসহ কর্মকর্তা লিখিত মতামত দেন" : "Officer annotates plan with field prescription"}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest dark:text-emerald">
                ৪
              </span>
              <p className="mt-2 text-xs font-bold text-content">
                {bn ? "৪. ফলো-আপ ও পরিদর্শন" : "4. Plot Follow-up"}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {bn ? "মাঠ বাস্তবায়ন চেকলিস্ট ট্র্যাকিং ও ফলো-আপ" : "Track field execution & schedule visit if needed"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <p className="text-xs text-muted">
            {bn
              ? "© কৃষিবন্ধু ভবিষ্যৎ রোডম্যাপ প্রিভিউ"
              : "© KrishiBondhu Agricultural Support Roadmap"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-forest px-5 py-2 text-xs font-semibold text-white hover:brightness-110"
          >
            {bn ? "বন্ধ করুন" : "Close Preview"}
          </button>
        </div>
      </div>
    </div>
  );
}
