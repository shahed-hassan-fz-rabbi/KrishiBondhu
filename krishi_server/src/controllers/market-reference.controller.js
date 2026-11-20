import { errorResponse, successResponse } from "../utils/response.js";
import {
  getMarketReferenceCatalog,
  getMarketReferenceSeries,
  MarketReferenceError,
  normalizeReferenceDivision,
} from "../services/market/reference.service.js";

const allowedDivisions = new Set(["National", "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Sylhet", "Mymensingh"]);

function respondWithReferenceError(res, error) {
  if (error instanceof MarketReferenceError) {
    return errorResponse(res, error.status, error.message, error.code);
  }
  return errorResponse(res, 503, "Monthly reference data is temporarily unavailable.", "REFERENCE_DATA_NOT_READY");
}

export async function getWorldBankReferenceCatalog(_req, res) {
  try {
    return successResponse(res, 200, await getMarketReferenceCatalog());
  } catch (error) {
    return respondWithReferenceError(res, error);
  }
}

export async function getWorldBankReferenceSeries(req, res) {
  const cropId = typeof req.query.cropId === "string" ? req.query.cropId.trim().slice(0, 80) : "";
  const division = normalizeReferenceDivision(typeof req.query.division === "string" ? req.query.division.trim().slice(0, 40) : "National");
  if (!cropId || !allowedDivisions.has(division)) {
    return errorResponse(res, 400, "Choose a listed crop and Bangladesh division", "INVALID_REFERENCE_QUERY");
  }
  try {
    return successResponse(res, 200, await getMarketReferenceSeries({ cropId, division }));
  } catch (error) {
    return respondWithReferenceError(res, error);
  }
}
