"use client";

import { useState } from "react";
import {
  CalendarDays,
  Bug,
  FlaskConical,
  Droplets,
  TrendingUp,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  BadgeCheck,
  Edit2,
  Trash2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Save,
  Sprout,
  CheckSquare,
  Square,
  ShieldAlert,
} from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";

const CATEGORY_MAP = {
  crop_planning: {
    labelEn: "Crop Planning",
    labelBn: "ফসল পরিকল্পনা",
    icon: CalendarDays,
    color: "bg-emerald/15 text-emerald-strong dark:text-emerald",
  },
  crop_disease: {
    labelEn: "Crop Disease",
    labelBn: "ফসলের রোগবালাই",
    icon: Bug,
    color: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
  soil_fertilizer: {
    labelEn: "Soil & Fertilizer",
    labelBn: "মাটি ও সার",
    icon: FlaskConical,
    color: "bg-purple/15 text-purple-strong dark:text-purple",
  },
  irrigation: {
    labelEn: "Irrigation",
    labelBn: "সেচ ও পানি",
    icon: Droplets,
    color: "bg-climate/15 text-climate-text",
  },
  market_advice: {
    labelEn: "Market Advice",
    labelBn: "বাজার পরামর্শ",
    icon: TrendingUp,
    color: "bg-amber/15 text-amber-strong dark:text-amber",
  },
};

const STATUS_MAP = {
  PENDING: {
    labelEn: "Pending Review",
    labelBn: "অপেক্ষমাণ",
    color: "bg-amber/15 text-amber-strong dark:text-amber border-amber/30",
    icon: Clock,
  },
  IN_PROGRESS: {
    labelEn: "In Progress",
    labelBn: "চলমান কাজ",
    color: "bg-climate/15 text-climate-text border-climate/30",
    icon: Sprout,
  },
  REVIEWED: {
    labelEn: "Reviewed",
    labelBn: "উত্তরপ্রাপ্ত",
    color: "bg-emerald/15 text-emerald-strong dark:text-emerald border-emerald/30",
    icon: BadgeCheck,
  },
  RESOLVED: {
    labelEn: "Resolved",
    labelBn: "সমাধানকৃত",
    color: "bg-forest/15 text-forest dark:text-forest-300 border-forest/30",
    icon: CheckCircle2,
  },
};

const PRIORITY_MAP = {
  LOW: { labelEn: "Low Priority", labelBn: "সাধারণ", color: "text-muted" },
  MEDIUM: { labelEn: "Standard", labelBn: "স্ট্যান্ডার্ড", color: "text-emerald-strong" },
  HIGH: { labelEn: "High Priority", labelBn: "জরুরি", color: "text-amber-strong" },
  URGENT: { labelEn: "Urgent", labelBn: "অতি জরুরি", color: "text-danger-strong" },
};

export function ConsultationCard({
  review,
  onEdit,
  onDelete,
  onUpdateChecklist,
  onSaveNotes,
  onUpdateStatus,
}) {
  const { locale } = useLang();
  const bn = locale === "bn";

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(review.farmerNotes || "");
  const [newTaskText, setNewTaskText] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);

  const category = CATEGORY_MAP[review.category] || CATEGORY_MAP.crop_planning;
  const CategoryIcon = category.icon;

  const status = STATUS_MAP[review.status] || STATUS_MAP.PENDING;
  const StatusIcon = status.icon;

  const priority = PRIORITY_MAP[review.priority] || PRIORITY_MAP.MEDIUM;

  const checklist = Array.isArray(review.checklist) ? review.checklist : [];
  const completedCount = checklist.filter((t) => t.completed).length;
  const totalCount = checklist.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Checklist toggle
  const handleToggleTask = async (taskId, currentCompleted) => {
    if (savingChecklist) return;
    setSavingChecklist(true);
    const updatedChecklist = checklist.map((item) =>
      item.id === taskId
        ? {
            ...item,
            completed: !currentCompleted,
            completedAt: !currentCompleted ? new Date().toISOString() : null,
          }
        : item
    );
    try {
      await onUpdateChecklist(review._id, updatedChecklist);
    } finally {
      setSavingChecklist(false);
    }
  };

  // Add new task
  const handleAddNewTask = async (e) => {
    e.preventDefault();
    if (!newTaskText.trim() || savingChecklist) return;
    setSavingChecklist(true);
    const updatedChecklist = [
      ...checklist,
      {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        task: newTaskText.trim(),
        completed: false,
        completedAt: null,
      },
    ];
    try {
      await onUpdateChecklist(review._id, updatedChecklist);
      setNewTaskText("");
      setShowAddTask(false);
    } finally {
      setSavingChecklist(false);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId) => {
    if (savingChecklist) return;
    setSavingChecklist(true);
    const updatedChecklist = checklist.filter((item) => item.id !== taskId);
    try {
      await onUpdateChecklist(review._id, updatedChecklist);
    } finally {
      setSavingChecklist(false);
    }
  };

  // Save notes
  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(review._id, notesDraft);
      setIsEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  };

  // Quick status change
  const handleStatusSelect = async (newStatus) => {
    if (newStatus === review.status) return;
    await onUpdateStatus(review._id, newStatus);
  };

  const createdDate = new Date(review.createdAt).toLocaleDateString(
    bn ? "bn-BD" : "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );

  return (
    <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-km-sm transition-all duration-200 hover:shadow-km-md">
      {/* Top Bar: Category, Status, Priority, Date */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Chip */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${category.color}`}
          >
            <CategoryIcon className="h-3.5 w-3.5" />
            {bn ? category.labelBn : category.labelEn}
          </span>

          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${status.color}`}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {bn ? status.labelBn : status.labelEn}
          </span>

          {/* Priority */}
          {review.priority && review.priority !== "MEDIUM" && (
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${priority.color}`}>
              {bn ? priority.labelBn : priority.labelEn}
            </span>
          )}
        </div>

        {/* Location & Date */}
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-forest" />
            {review.upazila}, {review.districtCode === "cumilla" ? (bn ? "কুমিল্লা" : "Cumilla") : (bn ? "চট্টগ্রাম" : "Chattogram")}
          </span>
          <span>•</span>
          <span>{createdDate}</span>
        </div>
      </div>

      {/* Main Content: Title & Question */}
      <div className="mt-4">
        <h3 className="text-lg font-bold text-content tracking-tight">
          {review.title || review.cropPlan?.cropName || (bn ? "পরামর্শ অনুসন্ধান" : "Consultation Inquiry")}
        </h3>

        {review.farmId && (
          <p className="mt-1 flex items-center gap-1 text-xs text-forest dark:text-emerald">
            <Sprout className="h-3.5 w-3.5" />
            <span>
              {bn ? "সংযুক্ত খামার:" : "Linked Farm:"} {review.farmId.farmName} ({review.farmId.crop || ""})
            </span>
          </p>
        )}

        <div className="mt-3 rounded-xl bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {bn ? "কৃষকের প্রশ্ন / অনুসন্ধানের বিবরণ:" : "Inquiry / Farmer Question:"}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm text-content leading-relaxed">
            {review.farmerQuestion}
          </p>

          {/* Crop Plan Highlights if present */}
          {review.cropPlan?.cropName && review.cropPlan.cropCode !== "general" && (
            <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-line/40 text-xs text-muted">
              {review.cropPlan.sowingPeriod && (
                <span>
                  {bn ? "বপন সময়:" : "Sowing:"} <strong>{review.cropPlan.sowingPeriod}</strong>
                </span>
              )}
              {review.cropPlan.totalDurationDays && (
                <span>
                  {bn ? "জীবনকাল:" : "Duration:"} <strong>{review.cropPlan.totalDurationDays} {bn ? "দিন" : "days"}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Official Officer Response Box */}
      {review.status === "REVIEWED" || review.officerResponse ? (
        <div className="mt-4 rounded-xl border border-emerald/30 bg-emerald/5 p-4.5 dark:bg-emerald/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald text-white">
                <BadgeCheck className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-content">
                {bn ? "উপজেলা কৃষি কর্মকর্তার প্রত্যয়িত মতামত" : "Official Extension Officer Advisory"}
              </span>
              {review.officerId?.name && (
                <span className="rounded-md bg-white/70 dark:bg-surface px-2 py-0.5 text-xs font-medium text-forest dark:text-emerald">
                  {review.officerId.name}
                </span>
              )}
            </div>
            {review.reviewedAt && (
              <span className="text-[11px] text-muted">
                {new Date(review.reviewedAt).toLocaleDateString(bn ? "bn-BD" : "en-US")}
              </span>
            )}
          </div>

          <p className="mt-2.5 whitespace-pre-line text-sm text-content leading-relaxed">
            {review.officerResponse}
          </p>
        </div>
      ) : null}

      {/* Interactive Consultation Checklist */}
      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-forest" />
            <span className="text-xs font-bold uppercase tracking-wider text-content">
              {bn ? "মাঠ বাস্তবায়ন ও করণীয় চেকলিস্ট" : "Action Checklist & Field Steps"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <span className="text-xs font-semibold text-muted">
                {completedCount}/{totalCount} ({progressPercent}%)
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAddTask(!showAddTask)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-forest-700 dark:text-emerald"
            >
              <Plus className="h-3.5 w-3.5" />
              {bn ? "নতুন কাজ যোগ" : "Add Task"}
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-emerald transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Add Task Input Form */}
        {showAddTask && (
          <form onSubmit={handleAddNewTask} className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder={bn ? "যেমন: ৫টি পয়েন্ট থেকে মাটি সংগ্রহ..." : "e.g., Collect soil sample from 5 spots..."}
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-content placeholder:text-muted focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald/20"
              autoFocus
            />
            <button
              type="submit"
              disabled={!newTaskText.trim() || savingChecklist}
              className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {bn ? "যোগ করুন" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddTask(false);
                setNewTaskText("");
              }}
              className="p-1.5 text-muted hover:text-content"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Task Items List */}
        <div className="mt-3 space-y-1.5">
          {checklist.length === 0 ? (
            <p className="text-xs text-muted italic">
              {bn
                ? "এখনো কোনো করণীয় কাজ যোগ করা হয়নি। ওপরের 'নতুন কাজ যোগ' বাটনে চাপ দিন।"
                : "No checklist tasks logged yet. Click 'Add Task' to plan field actions."}
            </p>
          ) : (
            checklist.map((task) => (
              <div
                key={task.id}
                className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2/60"
              >
                <button
                  type="button"
                  onClick={() => handleToggleTask(task.id, task.completed)}
                  disabled={savingChecklist}
                  className="flex flex-1 items-center gap-2.5 text-left text-xs"
                >
                  {task.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-muted shrink-0 group-hover:text-forest" />
                  )}
                  <span
                    className={`leading-snug transition-all ${
                      task.completed
                        ? "line-through text-muted"
                        : "text-content font-medium"
                    }`}
                  >
                    {task.task}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteTask(task.id)}
                  title={bn ? "কাজ মুছুন" : "Delete task"}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Personal Notes Section */}
      <div className="mt-4 rounded-xl border border-line/70 bg-surface-2/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              {bn ? "ব্যক্তিগত মাঠ নোট ও অগ্রগতি" : "Personal Field Notes & Updates"}
            </span>
          </div>
          {!isEditingNotes && (
            <button
              type="button"
              onClick={() => setIsEditingNotes(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:text-forest-700 dark:text-emerald"
            >
              <Edit2 className="h-3 w-3" />
              {review.farmerNotes ? (bn ? "নোট সম্পাদনা" : "Edit Notes") : (bn ? "নোট লিখুন" : "Add Notes")}
            </button>
          )}
        </div>

        {isEditingNotes ? (
          <div className="mt-2.5">
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder={
                bn
                  ? "আপনার ব্যক্তিগত পর্যবেক্ষণ, সারের তারিখ, বা আবহাওয়ার প্রতিক্রিয়া লিখুন..."
                  : "Record your field observations, treatment dates, or weather impact..."
              }
              className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-content focus:border-emerald focus:outline-none focus:ring-1 focus:ring-emerald/20"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotesDraft(review.farmerNotes || "");
                  setIsEditingNotes(false);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-2"
              >
                {bn ? "বাতিল" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {savingNotes ? (bn ? "সংরক্ষণ..." : "Saving...") : (bn ? "নোট সংরক্ষণ" : "Save Notes")}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-content leading-relaxed">
            {review.farmerNotes ? (
              review.farmerNotes
            ) : (
              <span className="italic text-muted">
                {bn ? "এখনো কোনো ব্যক্তিগত নোট সংরক্ষণ করা হয়নি।" : "No personal notes added yet."}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Card Footer: Status Transition & Management Controls */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
        {/* Status Dropdown/Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{bn ? "অবস্থা পরিবর্তন:" : "Update status:"}</span>
          <select
            value={review.status}
            onChange={(e) => handleStatusSelect(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-content focus:border-emerald focus:outline-none"
          >
            <option value="PENDING">{bn ? "অপেক্ষমাণ (Pending)" : "Pending"}</option>
            <option value="IN_PROGRESS">{bn ? "চলমান (In Progress)" : "In Progress"}</option>
            <option value="REVIEWED">{bn ? "উত্তরপ্রাপ্ত (Reviewed)" : "Reviewed"}</option>
            <option value="RESOLVED">{bn ? "সমাধানকৃত (Resolved)" : "Resolved"}</option>
          </select>
        </div>

        {/* Edit & Delete Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(review)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-2 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5 text-forest" />
            {bn ? "সম্পাদনা" : "Edit"}
          </button>

          {isDeleting ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDelete(review._id)}
                className="rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
              >
                {bn ? "মুছে ফেলুন" : "Confirm Delete"}
              </button>
              <button
                type="button"
                onClick={() => setIsDeleting(false)}
                className="rounded-lg border border-line px-2 py-1.5 text-xs text-content"
              >
                {bn ? "না" : "Cancel"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsDeleting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-danger hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bn ? "মুছুন" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
