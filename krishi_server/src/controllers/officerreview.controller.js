import mongoose from "mongoose";
import { Farm } from "../models/farm.model.js";
import { OfficerReview } from "../models/officerreview.model.js";
import { errorResponse, successResponse } from "../utils/response.js";

const DISTRICTS = new Set(["cumilla", "chattogram"]);
const cropPlanInput = (value) => {
  if (!value || typeof value !== "object") return null;
  const { cropCode, cropName, suitabilityCategory, sowingPeriod, totalDurationDays, waterRequirementMmTotal } = value;
  if (!["supported", "potential", "insufficient_info"].includes(suitabilityCategory)) return null;
  if (typeof cropCode !== "string" || !cropCode.trim() || typeof cropName !== "string" || !cropName.trim()) return null;
  const strings = (items) => Array.isArray(items) ? items.filter((item) => typeof item === "string").slice(0, 5).map((item) => item.slice(0, 240)) : [];
  return {
    cropCode: cropCode.trim().slice(0, 60),
    cropName: cropName.trim().slice(0, 120),
    suitabilityCategory,
    sowingPeriod: typeof sowingPeriod === "string" ? sowingPeriod.slice(0, 120) : "",
    totalDurationDays: Number.isFinite(Number(totalDurationDays)) ? Number(totalDurationDays) : null,
    waterRequirementMmTotal: Number.isFinite(Number(waterRequirementMmTotal)) ? Number(waterRequirementMmTotal) : null,
    reasons: strings(value.reasons),
    constraints: strings(value.constraints),
  };
};

export async function createOfficerReview(req, res, next) {
  try {
    const districtCode = String(req.body?.districtCode || "").toLowerCase();
    const upazila = typeof req.body?.upazila === "string" ? req.body.upazila.trim().slice(0, 100) : "";
    const farmerQuestion = typeof req.body?.farmerQuestion === "string" ? req.body.farmerQuestion.trim().slice(0, 1000) : "";
    const cropPlan = cropPlanInput(req.body?.cropPlan);
    if (!DISTRICTS.has(districtCode) || !upazila || farmerQuestion.length < 5 || !cropPlan) {
      return errorResponse(res, 400, "Provide a supported district, upazila, question, and crop plan", "INVALID_REVIEW_REQUEST");
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
    const review = await OfficerReview.create({ farmerId: req.user._id, farmId, districtCode, upazila, farmerQuestion, cropPlan });
    return successResponse(res, 201, { review }, { message: "Review request submitted" });
  } catch (error) { next(error); }
}

export async function listMyOfficerReviews(req, res, next) {
  try {
    const reviews = await OfficerReview.find({ farmerId: req.user._id }).sort({ createdAt: -1 }).limit(100).populate("officerId", "name").lean();
    return successResponse(res, 200, { reviews });
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
    const responseText = typeof req.body?.officerResponse === "string" ? req.body.officerResponse.trim().slice(0, 2000) : "";
    if (responseText.length < 10) return errorResponse(res, 400, "Review response must contain at least 10 characters", "INVALID_REVIEW_RESPONSE");
    const filter = { _id: req.params.id, status: "PENDING" };
    if (req.user.role !== "admin") filter.districtCode = req.user.preferredDistrict;
    const review = await OfficerReview.findOneAndUpdate(filter, {
      $set: { status: "REVIEWED", officerId: req.user._id, officerResponse: responseText, reviewedAt: new Date() },
    }, { new: true }).populate("farmerId", "name").populate("officerId", "name");
    if (!review) return errorResponse(res, 404, "Pending review not found for your district", "REVIEW_NOT_FOUND");
    return successResponse(res, 200, { review }, { message: "Officer review saved" });
  } catch (error) { next(error); }
}
