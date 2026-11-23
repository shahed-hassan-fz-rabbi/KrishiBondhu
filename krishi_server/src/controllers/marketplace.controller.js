import mongoose from "mongoose";
import { MarketplaceProduct } from "../models/marketplaceproduct.model.js";
import { errorResponse, successResponse } from "../utils/response.js";

const PUBLIC_PRODUCT_FIELDS = "productName description quantity unit askingPricePerUnit district upazila status createdAt updatedAt";
const FARMER_PRODUCT_FIELDS = "_id productName description quantity unit askingPricePerUnit district upazila status createdAt updatedAt";
const ALLOWED_UNITS = new Set(["kg", "quintal", "ton"]);
const MAX_PAGE_SIZE = 100;
const MAX_RESULT_OFFSET = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_DISTRICT_LENGTH = 80;
const ALLOWED_PRODUCT_QUERY_FIELDS = new Set(["q", "district", "page", "limit"]);
const EDITABLE_PRODUCT_FIELDS = new Set([
  "productName", "description", "quantity", "unit", "askingPricePerUnit", "district", "upazila", "status",
]);

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function parseOptionalTextQuery(value, field, maximumLength) {
  if (value === undefined) return { value: "" };
  if (typeof value !== "string") return { error: `${field} must be a single string value.` };
  const normalized = value.trim();
  if (normalized.length > maximumLength) return { error: `${field} cannot exceed ${maximumLength} characters.` };
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return { error: `${field} contains unsupported control characters.` };
  return { value: normalized };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateListingInput(body, { partial = false, rejectUnknown = false } = {}) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errors: [{ field: "body", message: "A product object is required." }] };
  }
  const suppliedFields = Object.keys(body);
  if (partial && suppliedFields.length === 0) errors.push({ field: "body", message: "Provide at least one field to update." });
  if (rejectUnknown) {
    for (const field of suppliedFields) {
      if (!EDITABLE_PRODUCT_FIELDS.has(field)) errors.push({ field, message: "This field cannot be updated." });
    }
  }
  const supplied = (field) => !partial || Object.hasOwn(body, field);
  const productName = typeof body?.productName === "string" ? body.productName.trim() : "";
  const description = body?.description === undefined ? "" : body.description;
  const district = typeof body?.district === "string" ? body.district.trim() : "";
  const upazila = typeof body?.upazila === "string" ? body.upazila.trim() : "";
  const hasStatus = partial && Object.hasOwn(body, "status");

  if (supplied("productName") && (productName.length < 2 || productName.length > 100)) errors.push({ field: "productName", message: "Product name must be 2–100 characters." });
  if (supplied("description") && (typeof description !== "string" || description.length > 2000)) errors.push({ field: "description", message: "Description must be a string of at most 2000 characters." });
  if (supplied("quantity") && (!Number.isFinite(body?.quantity) || body.quantity < 0.01 || body.quantity > Number.MAX_SAFE_INTEGER)) errors.push({ field: "quantity", message: "Quantity must be at least 0.01 and safely representable." });
  if (supplied("unit") && !ALLOWED_UNITS.has(body?.unit)) errors.push({ field: "unit", message: "Unit must be kg, quintal, or ton." });
  if (supplied("askingPricePerUnit") && (!Number.isFinite(body?.askingPricePerUnit) || body.askingPricePerUnit < 0.01 || body.askingPricePerUnit > Number.MAX_SAFE_INTEGER)) errors.push({ field: "askingPricePerUnit", message: "Asking price per unit must be at least 0.01 BDT and safely representable." });
  if (supplied("district") && (district.length < 2 || district.length > 80)) errors.push({ field: "district", message: "District must be 2–80 characters." });
  if (supplied("upazila") && (upazila.length < 2 || upazila.length > 80)) errors.push({ field: "upazila", message: "Upazila must be 2–80 characters." });
  if (hasStatus && !["active", "sold_out"].includes(body?.status)) errors.push({ field: "status", message: "Status must be active or sold_out." });

  if (errors.length) return { errors };
  const normalized = {};
  if (supplied("productName")) normalized.productName = productName;
  if (supplied("description")) normalized.description = description.trim();
  if (supplied("quantity")) normalized.quantity = body.quantity;
  if (supplied("unit")) normalized.unit = body.unit;
  if (supplied("askingPricePerUnit")) normalized.askingPricePerUnit = body.askingPricePerUnit;
  if (supplied("district")) normalized.district = district;
  if (supplied("upazila")) normalized.upazila = upazila;
  if (hasStatus) normalized.status = body.status;
  if (partial) return { value: normalized };
  return {
    value: normalized,
  };
}

/** GET /api/v1/marketplace/products — public active listing browse. */
export async function listMarketplaceProducts(req, res, next) {
  try {
    const unexpectedFields = Object.keys(req.query || {}).filter((field) => !ALLOWED_PRODUCT_QUERY_FIELDS.has(field));
    if (unexpectedFields.length) {
      return errorResponse(res, 400, "Unsupported Marketplace query parameter.", "INVALID_QUERY", unexpectedFields.map((field) => ({ field, message: "This query parameter is not supported." })));
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, MAX_PAGE_SIZE);
    if (!page || !limit || (page - 1) * limit > MAX_RESULT_OFFSET) return errorResponse(res, 400, "Page and limit must be positive integers; limit cannot exceed 100 or request an excessive offset.", "INVALID_PAGINATION");

    const search = parseOptionalTextQuery(req.query.q, "q", MAX_SEARCH_LENGTH);
    const district = parseOptionalTextQuery(req.query.district, "district", MAX_DISTRICT_LENGTH);
    const invalidFilters = [];
    if (search.error) invalidFilters.push({ field: "q", message: search.error });
    if (district.error) invalidFilters.push({ field: "district", message: district.error });
    if (invalidFilters.length) return errorResponse(res, 400, "Invalid Marketplace query parameters.", "INVALID_QUERY", invalidFilters);

    const filter = { status: "active" };
    if (search.value) filter.productName = { $regex: escapeRegex(search.value), $options: "i" };
    if (district.value) filter.district = { $regex: `^${escapeRegex(district.value)}$`, $options: "i" };
    const [products, total] = await Promise.all([
      MarketplaceProduct.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(PUBLIC_PRODUCT_FIELDS)
        .lean(),
      MarketplaceProduct.countDocuments(filter),
    ]);

    return successResponse(res, 200, {
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/v1/marketplace/products/mine — list every status for the authenticated farmer. */
export async function listMyMarketplaceProducts(req, res, next) {
  try {
    const allowedFields = new Set(["page", "limit"]);
    const unexpectedFields = Object.keys(req.query || {}).filter((field) => !allowedFields.has(field));
    if (unexpectedFields.length) {
      return errorResponse(res, 400, "Unsupported Marketplace query parameter.", "INVALID_QUERY", unexpectedFields.map((field) => ({ field, message: "This query parameter is not supported." })));
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, MAX_PAGE_SIZE);
    if (!page || !limit || (page - 1) * limit > MAX_RESULT_OFFSET) {
      return errorResponse(res, 400, "Page and limit must be positive integers; limit cannot exceed 100 or request an excessive offset.", "INVALID_PAGINATION");
    }

    const filter = { ownerId: req.user._id };
    const [products, total] = await Promise.all([
      MarketplaceProduct.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(FARMER_PRODUCT_FIELDS)
        .lean(),
      MarketplaceProduct.countDocuments(filter),
    ]);

    return successResponse(res, 200, {
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
}

/** POST /api/v1/marketplace/products — farmer-owned listing creation. */
export async function createMarketplaceProduct(req, res, next) {
  try {
    const validation = validateListingInput(req.body);
    if (validation.errors) return errorResponse(res, 400, "Validation failed.", "VALIDATION_ERROR", validation.errors);

    // Whitelist request fields and derive ownership exclusively from the JWT user.
    const product = await MarketplaceProduct.create({ ...validation.value, ownerId: req.user._id });
    const publicProduct = await MarketplaceProduct.findById(product._id).select(PUBLIC_PRODUCT_FIELDS).lean();
    return successResponse(res, 201, { product: publicProduct }, { message: "Product listing created." });
  } catch (error) {
    return next(error);
  }
}

/** PATCH /api/v1/marketplace/products/:id — update only an owned, non-archived listing. */
export async function updateMarketplaceProduct(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return errorResponse(res, 400, "Invalid product ID.", "INVALID_ID");
    const validation = validateListingInput(req.body, { partial: true, rejectUnknown: true });
    if (validation.errors) return errorResponse(res, 400, "Validation failed.", "VALIDATION_ERROR", validation.errors);

    const product = await MarketplaceProduct.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user._id, status: { $ne: "archived" } },
      { $set: validation.value },
      { new: true, runValidators: true },
    ).select(PUBLIC_PRODUCT_FIELDS).lean();
    if (!product) return errorResponse(res, 404, "Product listing not found.", "NOT_FOUND");
    return successResponse(res, 200, { product });
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/v1/marketplace/products/:id — soft-archive an owned listing. */
export async function archiveMarketplaceProduct(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return errorResponse(res, 400, "Invalid product ID.", "INVALID_ID");

    const product = await MarketplaceProduct.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user._id, status: { $ne: "archived" } },
      { $set: { status: "archived" } },
      { new: true, runValidators: true },
    ).select(PUBLIC_PRODUCT_FIELDS).lean();
    if (!product) return errorResponse(res, 404, "Product listing not found.", "NOT_FOUND");
    return successResponse(res, 200, { product });
  } catch (error) {
    return next(error);
  }
}
