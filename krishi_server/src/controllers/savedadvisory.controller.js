import mongoose from "mongoose";
import { SavedAdvisory } from "../models/savedadvisory.model.js";
import { errorResponse, successResponse } from "../utils/response.js";

const categories = new Set(["crop_planning", "rotation", "assistant"]);
const sourcePages = new Set(["/my-farm/plan", "/rotation-planner", "/assistant"]);

export async function listSavedAdvisories(req, res, next) {
  try {
    const advisories = await SavedAdvisory.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
    return successResponse(res, 200, { advisories });
  } catch (error) { return next(error); }
}

export async function createSavedAdvisory(req, res, next) {
  try {
    const { title, body, category = "crop_planning", cropCode = "", cropName = "", districtCode = "", upazila = "", sourceHref = "/my-farm/plan" } = req.body || {};
    if (typeof title !== "string" || title.trim().length < 2 || title.trim().length > 180 ||
        typeof body !== "string" || body.trim().length < 10 || body.trim().length > 5000 ||
        !categories.has(category) || !sourcePages.has(sourceHref) ||
        !["", "cumilla", "chattogram"].includes(districtCode) ||
        typeof cropCode !== "string" || cropCode.length > 60 || typeof cropName !== "string" || cropName.length > 120 ||
        typeof upazila !== "string" || upazila.length > 100) {
      return errorResponse(res, 400, "Provide a valid advisory title, content, category and source context", "INVALID_SAVED_ADVISORY");
    }
    const advisory = await SavedAdvisory.create({
      userId: req.user._id,
      title: title.trim(),
      body: body.trim(),
      category,
      cropCode: cropCode.trim(),
      cropName: cropName.trim(),
      districtCode,
      upazila: upazila.trim(),
      sourceHref,
    });
    return successResponse(res, 201, { advisory }, { message: "Advisory saved" });
  } catch (error) { return next(error); }
}

export async function deleteSavedAdvisory(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid advisory ID", "INVALID_ID");
    const advisory = await SavedAdvisory.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!advisory) return errorResponse(res, 404, "Saved advisory not found", "SAVED_ADVISORY_NOT_FOUND");
    return successResponse(res, 200, { deleted: true });
  } catch (error) { return next(error); }
}
