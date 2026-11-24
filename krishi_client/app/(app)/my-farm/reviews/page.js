"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  LoaderCircle,
  AlertCircle,
  ClipboardList,
  Inbox,
  Sprout,
  X,
  CalendarDays,
  Bug,
  FlaskConical,
  Droplets,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { PrivateAccess } from "@/components/auth/PrivateAccess.js";
import {
  fetchMyOfficerReviews,
  createOfficerReviewRequest,
  updateOfficerReview,
  deleteOfficerReview,
  fetchFarms,
} from "@/services/api.js";
import { useAuth } from "@/contexts/AuthContext.js";
import { useLocation } from "@/contexts/LocationContext.js";
import { useLang } from "@/lib/i18n/LanguageContext.js";

import { ConsultationStats } from "@/components/support/ConsultationStats.js";
import { ConsultationCard } from "@/components/support/ConsultationCard.js";
import { ConsultationModal } from "@/components/support/ConsultationModal.js";
import { OfficialAgriContacts } from "@/components/support/OfficialAgriContacts.js";
import { FutureSupportModal } from "@/components/support/FutureSupportModal.js";

const CATEGORY_FILTERS = [
  { id: "ALL", labelEn: "All Categories", labelBn: "সকল ক্যাটাগরি", icon: ClipboardList },
  { id: "crop_planning", labelEn: "Crop Planning", labelBn: "ফসল পরিকল্পনা", icon: CalendarDays },
  { id: "crop_disease", labelEn: "Crop Disease", labelBn: "রোগবালাই", icon: Bug },
  { id: "soil_fertilizer", labelEn: "Soil & Fertilizer", labelBn: "মাটি ও সার", icon: FlaskConical },
  { id: "irrigation", labelEn: "Irrigation", labelBn: "সেচ ও পানি", icon: Droplets },
  { id: "market_advice", labelEn: "Market Advice", labelBn: "বাজার পরামর্শ", icon: TrendingUp },
];

const STATUS_FILTERS = [
  { id: "ALL", labelEn: "All Status", labelBn: "সকল অবস্থা" },
  { id: "PENDING", labelEn: "Pending", labelBn: "অপেক্ষমাণ" },
  { id: "IN_PROGRESS", labelEn: "In Progress", labelBn: "চলমান" },
  { id: "REVIEWED", labelEn: "Reviewed", labelBn: "উত্তরপ্রাপ্ত" },
  { id: "RESOLVED", labelEn: "Resolved", labelBn: "সমাধানকৃত" },
];

function ConsultationTrackerContent() {
  const { user } = useAuth();
  const { selectedDistrict } = useLocation();
  const { locale } = useLang();
  const bn = locale === "bn";

  // State
  const [reviews, setReviews] = useState([]);
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [isFutureModalOpen, setIsFutureModalOpen] = useState(false);

  // Load reviews and farms
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reviewRes, farmRes] = await Promise.all([
        fetchMyOfficerReviews(),
        fetchFarms().catch(() => ({ success: false })),
      ]);

      if (reviewRes.success) {
        setReviews(reviewRes.data?.reviews || []);
      } else {
        setError(reviewRes.error?.message || (bn ? "পরামর্শ তালিকা লোড করা যায়নি।" : "Could not load consultation records."));
      }

      if (farmRes.success) {
        setFarms(farmRes.data?.farms || farmRes.data || []);
      }
    } catch {
      setError(bn ? "অনুরোধ সম্পন্ন হয়নি। সংযোগ দেখে আবার চেষ্টা করুন।" : "Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [bn]);

  useEffect(() => {
    let active = true;
    void loadData();
    return () => {
      active = false;
    };
  }, [loadData]);

  // Flash toast
  const triggerToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(""), 4000);
  };

  // Create or Update consultation handler
  const handleSaveConsultation = async (payload) => {
    if (editingReview) {
      // Update
      const res = await updateOfficerReview(editingReview._id, payload);
      if (res.success && res.data?.review) {
        setReviews((prev) =>
          prev.map((r) => (r._id === editingReview._id ? { ...r, ...res.data.review } : r))
        );
        triggerToast(bn ? "পরামর্শ রেকর্ড সফলভাবে হালনাগাদ করা হয়েছে।" : "Consultation updated successfully.");
      } else {
        throw new Error(res.error?.message || (bn ? "হালনাগাদ করা যায়নি।" : "Could not update consultation."));
      }
    } else {
      // Create
      const res = await createOfficerReviewRequest(payload);
      if (res.success && res.data?.review) {
        setReviews((prev) => [res.data.review, ...prev]);
        triggerToast(bn ? "নতুন পরামর্শ রেকর্ড সফলভাবে তৈরি করা হয়েছে।" : "Consultation created successfully.");
      } else {
        throw new Error(res.error?.message || (bn ? "তৈরি করা যায়নি।" : "Could not create consultation."));
      }
    }
  };

  // Delete consultation handler
  const handleDeleteConsultation = async (id) => {
    try {
      const res = await deleteOfficerReview(id);
      if (res.success) {
        setReviews((prev) => prev.filter((r) => r._id !== id));
        triggerToast(bn ? "পরামর্শ রেকর্ড মুছে ফেলা হয়েছে।" : "Consultation record deleted.");
      } else {
        setError(res.error?.message || (bn ? "মুছে ফেলা যায়নি।" : "Could not delete record."));
      }
    } catch {
      setError(bn ? "মুছে ফেলার সময় সমস্যা হয়েছে।" : "Error deleting consultation.");
    }
  };

  // Checklist update handler (optimistic)
  const handleUpdateChecklist = async (id, updatedChecklist) => {
    // Optimistic local update
    setReviews((prev) =>
      prev.map((r) => (r._id === id ? { ...r, checklist: updatedChecklist } : r))
    );
    try {
      await updateOfficerReview(id, { checklist: updatedChecklist });
    } catch {
      // Revert on error
      void loadData();
    }
  };

  // Save personal notes handler
  const handleSaveNotes = async (id, farmerNotes) => {
    const res = await updateOfficerReview(id, { farmerNotes });
    if (res.success) {
      setReviews((prev) =>
        prev.map((r) => (r._id === id ? { ...r, farmerNotes } : r))
      );
      triggerToast(bn ? "ব্যক্তিগত নোট সংরক্ষিত হয়েছে।" : "Personal notes saved.");
    }
  };

  // Update status handler
  const handleUpdateStatus = async (id, status) => {
    const res = await updateOfficerReview(id, { status });
    if (res.success) {
      setReviews((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status } : r))
      );
      triggerToast(bn ? "অবস্থা পরিবর্তিত হয়েছে।" : "Status updated.");
    }
  };

  // Filtering & Search
  const filteredReviews = reviews.filter((review) => {
    // Category match
    if (selectedCategory !== "ALL" && review.category !== selectedCategory) {
      return false;
    }

    // Status match
    if (selectedStatus !== "ALL" && review.status !== selectedStatus) {
      return false;
    }

    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const textToSearch = [
        review.title,
        review.farmerQuestion,
        review.farmerNotes,
        review.cropPlan?.cropName,
        review.cropPlan?.cropCode,
        review.upazila,
        review.districtCode,
        review.officerResponse,
        review.officerId?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!textToSearch.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const hasActiveFilters =
    searchQuery.trim() !== "" || selectedCategory !== "ALL" || selectedStatus !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("ALL");
    setSelectedStatus("ALL");
  };

  const defaultDistrictCode = user?.preferredDistrict || selectedDistrict || "chattogram";

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/my-farm"
          className="inline-flex items-center gap-2 text-sm font-semibold text-forest hover:text-forest-700 dark:text-emerald dark:hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft size={16} />
          {bn ? "আমার খামারে ফিরুন" : "Back to My Farm"}
        </Link>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-content transition-colors"
          title={bn ? "পুনরায় লোড করুন" : "Refresh"}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>{bn ? "হালনাগাদ" : "Sync"}</span>
        </button>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-xs font-medium text-emerald-strong dark:text-emerald animate-in slide-in-from-top duration-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast("")}
            className="p-1 text-emerald hover:opacity-75"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest dark:bg-emerald/15 dark:text-emerald">
              <ClipboardList className="h-3.5 w-3.5" />
              {bn ? "কৃষি কর্মকর্তা ও পরামর্শ ট্র্যাকার" : "Agricultural Support Dashboard"}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-content sm:text-3xl lg:text-4xl">
            {bn ? "কৃষি সহায়তা ও পরামর্শ ট্র্যাকার" : "Agricultural Support & Consultation Tracker"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted leading-relaxed">
            {bn
              ? "মাঠের সমস্যা নিবন্ধন করুন, ইন্টারঅ্যাক্টিভ চেকলিস্টে কাজের অগ্রগতি পর্যবেক্ষণ করুন, ব্যক্তিগত নোট সংরক্ষণ করুন এবং উপজেলা কৃষি কর্মকর্তার প্রত্যয়িত পরামর্শ গ্রহণ করুন।"
              : "Track farm consultations, manage field execution checklists, log personal notes, and view verified guidance from local agricultural extension officers."}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Future Work Preview Button */}
          <button
            type="button"
            onClick={() => setIsFutureModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs sm:text-sm font-semibold text-content hover:bg-surface-2 hover:border-emerald/40 transition-all shadow-km-sm"
          >
            <Sparkles className="h-4 w-4 text-emerald" />
            <span>{bn ? "ভবিষ্যৎ কৃষি সহায়তা" : "Future Agricultural Support"}</span>
          </button>

          {/* New Consultation Button */}
          <button
            type="button"
            onClick={() => {
              setEditingReview(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-forest px-4.5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:brightness-110 shadow-km-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>{bn ? "নতুন পরামর্শ যোগ" : "New Consultation"}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Statistics Tiles */}
      <div className="mt-8">
        <ConsultationStats reviews={reviews} />
      </div>

      {/* Search & Filter Controls */}
      <div className="mt-8 rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-km-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                bn
                  ? "প্রশ্ন, ফসল, রোগবালাই বা উপজেলা খুঁজুন..."
                  : "Search inquiries, crops, diseases, or upazila..."
              }
              className="w-full rounded-xl border border-line bg-surface-2/60 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-content placeholder:text-muted focus:border-emerald focus:bg-surface focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-content"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Tabs / Selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted mr-1">
              {bn ? "অবস্থা:" : "Status:"}
            </span>
            {STATUS_FILTERS.map((s) => {
              const active = selectedStatus === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStatus(s.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-forest text-white font-semibold"
                      : "border border-line bg-surface text-content hover:bg-surface-2"
                  }`}
                >
                  {bn ? s.labelBn : s.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-3 border-t border-line/60">
          <span className="text-xs font-semibold text-muted mr-1">
            {bn ? "ক্যাটাগরি:" : "Category:"}
          </span>
          {CATEGORY_FILTERS.map((c) => {
            const Icon = c.icon;
            const active = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  active
                    ? "bg-emerald text-white font-semibold shadow-xs"
                    : "border border-line bg-surface text-content hover:bg-surface-2"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{bn ? c.labelBn : c.labelEn}</span>
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline dark:text-emerald"
            >
              <X size={12} />
              {bn ? "ফিল্টার মুছুন" : "Clear filters"}
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between rounded-xl bg-red-50 p-4 text-xs sm:text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="font-semibold underline hover:no-underline"
          >
            {bn ? "পুনরায় চেষ্টা" : "Retry"}
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 py-12 text-center">
          <LoaderCircle className="h-7 w-7 animate-spin text-emerald" />
          <p className="text-sm font-medium text-content">
            {bn ? "পরামর্শ ও পর্যালোচনা লোড হচ্ছে…" : "Loading consultations & advisory records…"}
          </p>
        </div>
      )}

      {/* Empty State: No Consultations at all */}
      {!loading && !error && reviews.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 sm:p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-forest dark:text-emerald">
            <Inbox className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-bold text-content sm:text-lg">
            {bn ? "এখনো কোনো পরামর্শ রেকর্ড করা হয়নি" : "No consultation records yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm text-muted leading-relaxed">
            {bn
              ? "আপনার ফসল পরিকল্পনা, রোগবালাই, সার-কীটনাশক বা সেচ সংক্রান্ত অনুসন্ধান নিবন্ধন করুন। আপনি ব্যক্তিগত মাঠ নোট সংরক্ষণ করতে পারবেন এবং উপজেলা কৃষি কর্মকর্তার মূল্যায়ন পেতে পারবেন।"
              : "Register your crop inquiries, build action step checklists, save personal field notes, and connect with local agricultural extension officers."}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingReview(null);
              setIsCreateModalOpen(true);
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest px-4.5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:brightness-110 shadow-km-sm"
          >
            <Plus className="h-4 w-4" />
            <span>{bn ? "প্রথম পরামর্শ রেকর্ড যোগ করুন" : "Log First Consultation"}</span>
          </button>
        </div>
      )}

      {/* Empty State: No Consultations matching search/filters */}
      {!loading && reviews.length > 0 && filteredReviews.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted" />
          <h3 className="mt-3 text-sm font-bold text-content">
            {bn ? "এই ফিল্টারে কোনো পরামর্শ মেলেনি" : "No consultations match your filter"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {bn
              ? "অনুসন্ধান শব্দ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।"
              : "Try adjusting your search query or reset category and status filters."}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-xs font-semibold text-forest underline hover:no-underline dark:text-emerald"
          >
            {bn ? "সকল ফিল্টার মুছুন" : "Reset all filters"}
          </button>
        </div>
      )}

      {/* Consultation Records List */}
      {!loading && filteredReviews.length > 0 && (
        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {bn
                ? `মোট ${filteredReviews.length} টি রেকর্ড পাওয়া গেছে`
                : `Showing ${filteredReviews.length} of ${reviews.length} consultations`}
            </span>
          </div>

          {filteredReviews.map((review) => (
            <ConsultationCard
              key={review._id}
              review={review}
              onEdit={(r) => {
                setEditingReview(r);
                setIsCreateModalOpen(true);
              }}
              onDelete={handleDeleteConsultation}
              onUpdateChecklist={handleUpdateChecklist}
              onSaveNotes={handleSaveNotes}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      {/* Official Agricultural Support Contacts Section */}
      <OfficialAgriContacts
        defaultDistrict={defaultDistrictCode}
        defaultUpazila={reviews[0]?.upazila || ""}
      />

      {/* Create / Edit Consultation Modal */}
      <ConsultationModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingReview(null);
        }}
        onSubmit={handleSaveConsultation}
        initialData={editingReview}
        farms={farms}
        defaultDistrict={defaultDistrictCode}
        defaultUpazila={reviews[0]?.upazila || ""}
      />

      {/* Future Work Preview Modal */}
      <FutureSupportModal
        isOpen={isFutureModalOpen}
        onClose={() => setIsFutureModalOpen(false)}
      />
    </main>
  );
}

export default function MyReviewsPage() {
  return (
    <PrivateAccess>
      <ConsultationTrackerContent />
    </PrivateAccess>
  );
}
