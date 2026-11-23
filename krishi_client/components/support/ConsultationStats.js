"use client";

import { ClipboardList, Clock, CheckCircle2, ListTodo, AlertCircle } from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";

export function ConsultationStats({ reviews = [] }) {
  const { locale } = useLang();
  const bn = locale === "bn";

  const total = reviews.length;
  const pending = reviews.filter((r) => r.status === "PENDING").length;
  const inProgress = reviews.filter((r) => r.status === "IN_PROGRESS").length;
  const reviewed = reviews.filter((r) => r.status === "REVIEWED" || r.status === "RESOLVED").length;

  // Compute checklist stats across all reviews
  let totalTasks = 0;
  let completedTasks = 0;
  reviews.forEach((r) => {
    if (Array.isArray(r.checklist)) {
      totalTasks += r.checklist.length;
      completedTasks += r.checklist.filter((t) => t.completed).length;
    }
  });

  const stats = [
    {
      id: "total",
      label: bn ? "মোট পরামর্শ রেকর্ড" : "Total Consultations",
      value: total,
      sub: bn ? "আপনার সংরক্ষিত সকল প্রশ্ন ও পরামর্শ" : "All logged inquiries & reviews",
      icon: ClipboardList,
      tone: "emerald",
      badgeColor: "bg-emerald/10 text-emerald-strong dark:text-emerald",
      dotColor: "bg-emerald",
    },
    {
      id: "pending",
      label: bn ? "অপেক্ষমাণ পর্যালোচনা" : "Pending Review",
      value: pending,
      sub: bn ? "উপজেলা কৃষি কর্মকর্তার অনুমোদনাধীন" : "Awaiting DAE officer feedback",
      icon: Clock,
      tone: "amber",
      badgeColor: "bg-amber/15 text-amber-strong dark:text-amber",
      dotColor: "bg-amber",
    },
    {
      id: "inProgress",
      label: bn ? "চলমান মাঠ কাজ" : "In Progress",
      value: inProgress,
      sub: bn ? "বাস্তবায়নাধীন পর্যবেক্ষণ ও কাজ" : "Active field actions underway",
      icon: ListTodo,
      tone: "blue",
      badgeColor: "bg-climate/15 text-climate-text",
      dotColor: "bg-climate",
    },
    {
      id: "reviewed",
      label: bn ? "সম্পন্ন ও পর্যালোচিত" : "Officer Reviewed",
      value: reviewed,
      sub: bn ? "কর্মকর্তার দিকনির্দেশনা যুক্ত হয়েছে" : "Guidance received from officer",
      icon: CheckCircle2,
      tone: "forest",
      badgeColor: "bg-forest/10 text-forest dark:bg-forest-900/30 dark:text-forest-300",
      dotColor: "bg-forest",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.id}
            className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-km-sm transition-all duration-200 hover:shadow-km-md"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {stat.label}
              </span>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.badgeColor}`}>
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-content sm:text-4xl">
                {stat.value}
              </span>
              {stat.id === "inProgress" && totalTasks > 0 ? (
                <span className="text-xs font-medium text-muted">
                  ({completedTasks}/{totalTasks} {bn ? "কাজ শেষ" : "tasks done"})
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-xs text-muted leading-relaxed">
              {stat.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
