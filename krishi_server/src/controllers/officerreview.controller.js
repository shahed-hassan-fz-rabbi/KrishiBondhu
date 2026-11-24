import mongoose from "mongoose";
import { Farm } from "../models/farm.model.js";
import { OfficerReview } from "../models/officerreview.model.js";
import { errorResponse, successResponse } from "../utils/response.js";

const DISTRICTS = new Set(["cumilla", "chattogram"]);
const VALID_CATEGORIES = new Set(["crop_planning", "crop_disease", "soil_fertilizer", "irrigation", "market_advice"]);
const VALID_STATUSES = new Set(["PENDING", "IN_PROGRESS", "REVIEWED", "RESOLVED"]);
const VALID_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const cropPlanInput = (value) => {
  if (!value || typeof value !== "object") return null;
  const { cropCode, cropName, suitabilityCategory, sowingPeriod, totalDurationDays, waterRequirementMmTotal } = value;
  const code = typeof cropCode === "string" && cropCode.trim() ? cropCode.trim().slice(0, 60) : "general";
  const name = typeof cropName === "string" && cropName.trim() ? cropName.trim().slice(0, 120) : "General Agriculture";
  const category = ["supported", "potential", "insufficient_info"].includes(suitabilityCategory) ? suitabilityCategory : "supported";
  const strings = (items) => Array.isArray(items) ? items.filter((item) => typeof item === "string").slice(0, 5).map((item) => item.slice(0, 240)) : [];
  return {
    cropCode: code,
    cropName: name,
    suitabilityCategory: category,
    sowingPeriod: typeof sowingPeriod === "string" ? sowingPeriod.slice(0, 120) : "",
    totalDurationDays: Number.isFinite(Number(totalDurationDays)) ? Number(totalDurationDays) : null,
    waterRequirementMmTotal: Number.isFinite(Number(waterRequirementMmTotal)) ? Number(waterRequirementMmTotal) : null,
    reasons: strings(value.reasons),
    constraints: strings(value.constraints),
  };
};

const sanitizeChecklist = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === "string") {
      const task = item.trim().slice(0, 300);
      return task ? { id: new mongoose.Types.ObjectId().toString(), task, completed: false, completedAt: null } : null;
    }
    if (item && typeof item === "object") {
      const task = typeof item.task === "string" ? item.task.trim().slice(0, 300) : "";
      if (!task) return null;
      const completed = Boolean(item.completed);
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : new mongoose.Types.ObjectId().toString(),
        task,
        completed,
        completedAt: completed ? (item.completedAt ? new Date(item.completedAt) : new Date()) : null,
      };
    }
    return null;
  }).filter(Boolean);
};

export async function createOfficerReview(req, res, next) {
  try {
    const districtCode = String(req.body?.districtCode || "").toLowerCase();
    const upazila = typeof req.body?.upazila === "string" ? req.body.upazila.trim().slice(0, 100) : "";
    const farmerQuestion = typeof req.body?.farmerQuestion === "string" ? req.body.farmerQuestion.trim().slice(0, 1500) : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
    const farmerNotes = typeof req.body?.farmerNotes === "string" ? req.body.farmerNotes.trim().slice(0, 3000) : "";
    const category = VALID_CATEGORIES.has(req.body?.category) ? req.body.category : "crop_planning";
    const priority = VALID_PRIORITIES.has(req.body?.priority) ? req.body.priority : "MEDIUM";
    const checklist = sanitizeChecklist(req.body?.checklist);

    // If cropPlan is provided, parse it; otherwise default gracefully
    let cropPlan = cropPlanInput(req.body?.cropPlan);
    if (!cropPlan) {
      cropPlan = {
        cropCode: "general",
        cropName: title || "General Agriculture",
        suitabilityCategory: "supported",
        sowingPeriod: "",
        totalDurationDays: null,
        waterRequirementMmTotal: null,
        reasons: [],
        constraints: [],
      };
    }

    if (!DISTRICTS.has(districtCode) || !upazila || farmerQuestion.length < 5) {
      return errorResponse(res, 400, "Provide a supported district, upazila, and question (at least 5 characters)", "INVALID_REVIEW_REQUEST");
    }

    let farmId = null;
    if (req.body?.farmId) {
      const farm = mongoose.isValidObjectId(req.body.farmId)
        ? await Farm.findOne({ _id: req.body.farmId, userId: req.user._id }).select("location").lean()
        : null;
      if (!farm) {
        return errorResponse(res, 404, "Farm not found", "FARM_NOT_FOUND");
      }
      if (farm.location?.districtCode !== districtCode || (farm.location?.upazila && farm.location.upazila.toLowerCase() !== upazila.toLowerCase())) {
        return errorResponse(res, 400, "Review district and upazila must match the selected farm", "LOCATION_MISMATCH");
      }
      farmId = req.body.farmId;
    }

    const review = await OfficerReview.create({
      farmerId: req.user._id,
      farmId,
      districtCode,
      upazila,
      category,
      title: title || cropPlan.cropName || "Consultation Request",
      farmerQuestion,
      farmerNotes,
      cropPlan,
      checklist,
      priority,
      status: "PENDING",
    });

    return successResponse(res, 201, { review }, { message: "Consultation record created successfully" });
  } catch (error) { next(error); }
}

export async function listMyOfficerReviews(req, res, next) {
  try {
    const filter = { farmerId: req.user._id };
    if (VALID_CATEGORIES.has(req.query?.category)) {
      filter.category = req.query.category;
    }
    if (VALID_STATUSES.has(req.query?.status)) {
      filter.status = req.query.status;
    }
    const reviews = await OfficerReview.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("officerId", "name phone email")
      .populate("farmId", "farmName crop location")
      .lean();
    return successResponse(res, 200, { reviews });
  } catch (error) { next(error); }
}

export async function getOfficerReviewById(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid ID", "INVALID_ID");
    const query = req.user.role === "farmer" ? { _id: req.params.id, farmerId: req.user._id } : { _id: req.params.id };
    const review = await OfficerReview.findOne(query)
      .populate("officerId", "name phone email")
      .populate("farmerId", "name phone")
      .populate("farmId", "farmName crop location")
      .lean();
    if (!review) return errorResponse(res, 404, "Consultation record not found", "NOT_FOUND");
    return successResponse(res, 200, { review });
  } catch (error) { next(error); }
}

export async function updateOfficerReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid consultation ID", "INVALID_ID");
    const review = await OfficerReview.findOne({ _id: req.params.id, farmerId: req.user._id });
    if (!review) return errorResponse(res, 404, "Consultation record not found", "NOT_FOUND");

    if (typeof req.body?.title === "string") {
      review.title = req.body.title.trim().slice(0, 200);
    }
    if (typeof req.body?.farmerQuestion === "string" && req.body.farmerQuestion.trim().length >= 5) {
      review.farmerQuestion = req.body.farmerQuestion.trim().slice(0, 1500);
    }
    if (typeof req.body?.farmerNotes === "string") {
      review.farmerNotes = req.body.farmerNotes.trim().slice(0, 3000);
    }
    if (VALID_CATEGORIES.has(req.body?.category)) {
      review.category = req.body.category;
    }
    if (VALID_STATUSES.has(req.body?.status)) {
      review.status = req.body.status;
    }
    if (VALID_PRIORITIES.has(req.body?.priority)) {
      review.priority = req.body.priority;
    }
    if (Array.isArray(req.body?.checklist)) {
      review.checklist = sanitizeChecklist(req.body.checklist);
    }
    if (req.body?.cropPlan && typeof req.body.cropPlan === "object") {
      const parsedPlan = cropPlanInput(req.body.cropPlan);
      if (parsedPlan) review.cropPlan = parsedPlan;
    }

    await review.save();
    return successResponse(res, 200, { review }, { message: "Consultation updated successfully" });
  } catch (error) { next(error); }
}

export async function deleteOfficerReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid consultation ID", "INVALID_ID");
    const review = await OfficerReview.findOneAndDelete({ _id: req.params.id, farmerId: req.user._id });
    if (!review) return errorResponse(res, 404, "Consultation record not found", "NOT_FOUND");
    return successResponse(res, 200, { id: req.params.id }, { message: "Consultation record deleted successfully" });
  } catch (error) { next(error); }
}

export async function listOfficerReviewQueue(req, res, next) {
  try {
    const filter = req.user.role === "admin" ? {} : { districtCode: req.user.preferredDistrict };
    if (["PENDING", "REVIEWED"].includes(req.query.status)) filter.status = req.query.status;
    const reviews = await OfficerReview.find(filter).sort({ status: 1, createdAt: 1 }).limit(100)
      .populate("farmerId", "name phone")
      .populate("farmId", "farmName crop")
      .populate("officerId", "name")
      .lean();
    return successResponse(res, 200, { reviews, districtCode: req.user.role === "admin" ? null : req.user.preferredDistrict });
  } catch (error) { next(error); }
}

export async function submitOfficerReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid review ID", "INVALID_ID");
    const responseText = typeof req.body?.officerResponse === "string" ? req.body.officerResponse.trim().slice(0, 3000) : "";
    if (responseText.length < 10) return errorResponse(res, 400, "Review response must contain at least 10 characters", "INVALID_REVIEW_RESPONSE");
    const filter = { _id: req.params.id, status: { $in: ["PENDING", "IN_PROGRESS"] } };
    if (req.user.role !== "admin") filter.districtCode = req.user.preferredDistrict;
    const review = await OfficerReview.findOneAndUpdate(filter, {
      $set: { status: "REVIEWED", officerId: req.user._id, officerResponse: responseText, reviewedAt: new Date() },
    }, { new: true }).populate("farmerId", "name").populate("officerId", "name");
    if (!review) return errorResponse(res, 404, "Pending review not found for your district", "REVIEW_NOT_FOUND");
    return successResponse(res, 200, { review }, { message: "Officer review saved" });
  } catch (error) { next(error); }
}
