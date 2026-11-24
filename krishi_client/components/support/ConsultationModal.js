"use client";

import { useState } from "react";
import { X, Plus, Trash2, CalendarDays, Bug, FlaskConical, Droplets, TrendingUp, LoaderCircle } from "lucide-react";
import { useLang } from "@/lib/i18n/LanguageContext.js";
import { getUpazilasForDistrict } from "@/lib/upazilas.js";

const CATEGORIES = [
  {
    id: "crop_planning",
    labelEn: "Crop Planning",
    labelBn: "ফসল পরিকল্পনা",
    icon: CalendarDays,
    suggestions: [
      "Check residual soil moisture before sowing",
      "Verify seed variety availability at local market",
      "Plan field turnaround days between harvest and planting",
    ],
    suggestionsBn: [
      "বপনের পূর্বে মাটির আর্দ্রতা পরীক্ষা করা",
      "স্থানীয় বাজারে প্রত্যয়িত বীজের প্রাপ্যতা যাচাই",
      "ফসল কাটার পর জমি তৈরির মধ্যবর্তী দিন হিসাব করা",
    ],
  },
  {
    id: "crop_disease",
    labelEn: "Crop Disease",
    labelBn: "ফসলের রোগবালাই",
    icon: Bug,
    suggestions: [
      "Inspect leaf undersides and stems for lesions",
      "Take close-up photos of infected plant tissue",
      "Isolate affected area to prevent pathogen spread",
    ],
    suggestionsBn: [
      "পাতার নিচের অংশ ও কাণ্ডের দাগ পর্যবেক্ষণ",
      "আক্রান্ত অংশের স্পষ্ট ছবি তুলে রাখা",
      "জীবাণু বিস্তার রোধে আক্রান্ত গাছ আলাদা করা",
    ],
  },
  {
    id: "soil_fertilizer",
    labelEn: "Soil & Fertilizer",
    labelBn: "মাটি ও সার",
    icon: FlaskConical,
    suggestions: [
      "Collect composite soil sample from 5 field points",
      "Check upazila DAE soil fertility map",
      "Calculate balanced nitrogen and potash ratio",
    ],
    suggestionsBn: [
      "জমির ৫টি স্থান থেকে মিশ্র মাটির নমুনা সংগ্রহ",
      "উপজেলা সার সুপারিশ সহায়িকা দেখা",
      "ইউরিয়া ও পটাশের সুষম মাত্রা নির্ধারণ",
    ],
  },
  {
    id: "irrigation",
    labelEn: "Irrigation",
    labelBn: "সেচ ও পানি",
    icon: Droplets,
    suggestions: [
      "Measure standing water depth in plot",
      "Inspect drainage furrows before rain forecast",
      "Coordinate shallow tube-well pump schedule",
    ],
    suggestionsBn: [
      "জমিতে জমে থাকা পানির উচ্চতা পরীক্ষা",
      "বৃষ্টির পূর্বে নিষ্কাশন নালা পরিষ্কার করা",
      "সেচ পাম্পের সময়সূচি নির্ধারণ",
    ],
  },
  {
    id: "market_advice",
    labelEn: "Market Advice",
    labelBn: "বাজার পরামর্শ",
    icon: TrendingUp,
    suggestions: [
      "Check DAM verified wholesale mandi price",
      "Estimate harvest packing and transport cost",
      "Identify alternative local buyer or wholesale depot",
    ],
    suggestionsBn: [
      "কৃষি বিপণন অধিদপ্তরের পাইকারি দর যাচাই",
      "প্যাকেজিং ও পরিবহন খরচ হিসাব করা",
      "নিকটস্থ আড়তদার বা পাইকার চিহ্নিত করা",
    ],
  },
];

export function ConsultationModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  farms = [],
  defaultDistrict = "chattogram",
  defaultUpazila = "",
}) {
  const { locale } = useLang();
  const bn = locale === "bn";

  const [category, setCategory] = useState(initialData?.category || "crop_planning");
  const [title, setTitle] = useState(initialData?.title || "");
  const [districtCode, setDistrictCode] = useState(initialData?.districtCode || defaultDistrict || "chattogram");
  const [upazila, setUpazila] = useState(initialData?.upazila || defaultUpazila || "");
  const [farmId, setFarmId] = useState(initialData?.farmId?._id || initialData?.farmId || "");
  const [farmerQuestion, setFarmerQuestion] = useState(initialData?.farmerQuestion || "");
  const [farmerNotes, setFarmerNotes] = useState(initialData?.farmerNotes || "");
  const [priority, setPriority] = useState(initialData?.priority || "MEDIUM");
  const [checklist, setChecklist] = useState(initialData?.checklist || []);
  const [newTaskInput, setNewTaskInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availableUpazilas = getUpazilasForDistrict(districtCode);

  // Handle category change and optionally populate template checklist if empty
  const handleCategorySelect = (newCategory) => {
    setCategory(newCategory);
    if (!initialData && checklist.length === 0) {
      const catObj = CATEGORIES.find((c) => c.id === newCategory);
      if (catObj) {
        const suggested = (bn ? catObj.suggestionsBn : catObj.suggestions).map((t) => ({
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          task: t,
          completed: false,
        }));
        setChecklist(suggested);
      }
    }
  };

  // Add task to checklist
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    setChecklist([
      ...checklist,
      {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        task: newTaskInput.trim(),
        completed: false,
      },
    ]);
    setNewTaskInput("");
  };

  // Remove task from checklist
  const handleRemoveTask = (taskId) => {
    setChecklist(checklist.filter((t) => t.id !== taskId));
  };

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (farmerQuestion.trim().length < 5) {
      setError(bn ? "অনুসন্ধানের বিবরণ অন্তত ৫ অক্ষরের হতে হবে।" : "Question must be at least 5 characters.");
      return;
    }
    if (!upazila) {
      setError(bn ? "উপজেলা নির্বাচন করুন।" : "Please select an upazila.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload = {
        category,
        title: title.trim() || undefined,
        districtCode,
        upazila,
        farmId: farmId || undefined,
        farmerQuestion: farmerQuestion.trim(),
        farmerNotes: farmerNotes.trim(),
        priority,
        checklist,
      };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err?.message || (bn ? "সংরক্ষণ করা যায়নি।" : "Failed to save consultation."));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-xl font-bold text-content tracking-tight">
              {initialData
                ? (bn ? "পরামর্শ রেকর্ড সম্পাদনা" : "Edit Consultation Record")
                : (bn ? "নতুন কৃষি সহায়তা ও পরামর্শ নিবন্ধন" : "New Agricultural Support & Consultation")}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {bn
                ? "আপনার ফসলের সমস্যা বা পরিকল্পনা লিখে রাখুন এবং স্থানীয় কৃষি কর্মকর্তার পর্যালোচনার জন্য প্রস্তুত করুন।"
                : "Log field issues, plan action steps, and organize advisory feedback."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-content transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Category Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted">
              {bn ? "পরামর্শের ক্যাটাগরি *" : "Consultation Category *"}
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition-all ${
                      isSelected
                        ? "border-emerald bg-emerald/10 text-emerald-strong dark:text-emerald shadow-km-sm"
                        : "border-line bg-surface text-content hover:bg-surface-2"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{bn ? cat.labelBn : cat.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject / Title */}
          <div>
            <label className="text-xs font-semibold text-content">
              {bn ? "বিষয় / শিরোনাম" : "Subject / Title"}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={bn ? "যেমন: আমন ধানে পাতাপোড়া রোগ বা ইউরিয়া সারের প্রয়োগ..." : "e.g., Aman Rice Leaf Blast diagnosis..."}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content focus:border-emerald focus:outline-none"
            />
          </div>

          {/* Location & Farm Link */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-content">
                {bn ? "জেলা *" : "District *"}
              </label>
              <select
                value={districtCode}
                onChange={(e) => {
                  setDistrictCode(e.target.value);
                  const upz = getUpazilasForDistrict(e.target.value);
                  setUpazila(upz[0]?.nameEn || "");
                }}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-content focus:border-emerald focus:outline-none"
              >
                <option value="chattogram">{bn ? "চট্টগ্রাম" : "Chattogram"}</option>
                <option value="cumilla">{bn ? "কুমিল্লা" : "Cumilla"}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-content">
                {bn ? "উপজেলা *" : "Upazila *"}
              </label>
              <select
                value={upazila}
                onChange={(e) => setUpazila(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-content focus:border-emerald focus:outline-none"
              >
                {availableUpazilas.map((u) => (
                  <option key={u.code} value={u.nameEn}>
                    {bn ? u.nameBn : u.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-content">
                {bn ? "সংযুক্ত খামার (ঐচ্ছিক)" : "Link Farm (Optional)"}
              </label>
              <select
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-content focus:border-emerald focus:outline-none"
              >
                <option value="">{bn ? "কোনোটি নয়" : "None"}</option>
                {farms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.farmName} ({f.crop || ""})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Farmer Question */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-content">
                {bn ? "আপনার প্রশ্ন বা মাঠ সমস্যার বিস্তারিত বিবরণ *" : "Inquiry / Problem Description *"}
              </label>
              <span className="text-[11px] text-muted">
                {farmerQuestion.length}/1500
              </span>
            </div>
            <textarea
              required
              rows={4}
              maxLength={1500}
              value={farmerQuestion}
              onChange={(e) => setFarmerQuestion(e.target.value)}
              placeholder={
                bn
                  ? "ফসলের লক্ষণ, আক্রান্ত পাতার অবস্থা, জমিতে পানির স্তর বা যে বিষয়ে কর্মকর্তার নির্দেশনা চান তা বিস্তারিত লিখুন..."
                  : "Describe crop symptoms, weather context, planting date, or specific guidance needed..."
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-surface p-3 text-xs text-content focus:border-emerald focus:outline-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-content">
              {bn ? "জরুরিতা / প্রায়োরিটি" : "Priority"}
            </label>
            <div className="mt-1.5 flex gap-2">
              {[
                { id: "LOW", labelEn: "Low", labelBn: "সাধারণ" },
                { id: "MEDIUM", labelEn: "Standard", labelBn: "স্ট্যান্ডার্ড" },
                { id: "HIGH", labelEn: "High", labelBn: "জরুরি" },
                { id: "URGENT", labelEn: "Urgent", labelBn: "অতি জরুরি" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPriority(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    priority === p.id
                      ? "bg-forest text-white"
                      : "border border-line bg-surface text-content hover:bg-surface-2"
                  }`}
                >
                  {bn ? p.labelBn : p.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist Builder */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted">
              {bn ? "মাঠ বাস্তবায়ন চেকলিস্ট (অগ্রগতি ট্র্যাক করুন)" : "Field Action Checklist"}
            </label>
            <div className="mt-2 space-y-1.5">
              {checklist.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-1.5">
                  <span className="text-xs text-content leading-snug">{task.task}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    className="p-1 text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder={bn ? "নতুন পদক্ষেপ লিখুন..." : "Add a step to the checklist..."}
                className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-content focus:border-emerald focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddTask}
                disabled={!newTaskInput.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-surface-2 px-3 py-2 text-xs font-semibold text-content hover:bg-surface-2/80 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                {bn ? "যোগ" : "Add"}
              </button>
            </div>
          </div>

          {/* Personal Notes */}
          <div>
            <label className="text-xs font-semibold text-content">
              {bn ? "ব্যক্তিগত নোট (শুধুমাত্র আপনার জন্য দৃশ্যমান)" : "Personal Notes (Private to you)"}
            </label>
            <textarea
              rows={2}
              maxLength={3000}
              value={farmerNotes}
              onChange={(e) => setFarmerNotes(e.target.value)}
              placeholder={bn ? "যেমন: ইউরিয়া সারের খরচ ৩৫০ টাকা হয়েছে, আগামী সোমবারে সেচ দেওয়া হবে..." : "Optional personal records, cost calculations, or reminder notes..."}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface p-3 text-xs text-content focus:border-emerald focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-content hover:bg-surface-2"
            >
              {bn ? "বাতিল" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {initialData
                ? (bn ? "হালনাগাদ সংরক্ষণ" : "Save Changes")
                : (bn ? "পরামর্শ সংরক্ষণ করুন" : "Save Consultation")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
