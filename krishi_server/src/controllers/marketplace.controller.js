import { MarketplaceProduct } from "../models/marketplaceproduct.model.js";
import { errorResponse, successResponse } from "../utils/response.js";

const PUBLIC_PRODUCT_FIELDS = "productName description quantity unit askingPricePerUnit district upazila status createdAt updatedAt";
const ALLOWED_UNITS = new Set(["kg", "quintal", "ton"]);
const MAX_PAGE_SIZE = 100;
const MAX_RESULT_OFFSET = 1_000_000;

function parsePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

function validateListingInput(body) {
  const errors = [];
  const productName = typeof body?.productName === "string" ? body.productName.trim() : "";
  const description = body?.description === undefined ? "" : body.description;
  const district = typeof body?.district === "string" ? body.district.trim() : "";
  const upazila = typeof body?.upazila === "string" ? body.upazila.trim() : "";

  if (productName.length < 2 || productName.length > 100) errors.push({ field: "productName", message: "Product name must be 2–100 characters." });
  if (typeof description !== "string" || description.length > 2000) errors.push({ field: "description", message: "Description must be a string of at most 2000 characters." });
  if (!Number.isFinite(body?.quantity) || body.quantity <= 0 || body.quantity > Number.MAX_SAFE_INTEGER) errors.push({ field: "quantity", message: "Quantity must be a positive, safely representable number." });
  if (!ALLOWED_UNITS.has(body?.unit)) errors.push({ field: "unit", message: "Unit must be kg, quintal, or ton." });
  if (!Number.isFinite(body?.askingPricePerUnit) || body.askingPricePerUnit <= 0 || body.askingPricePerUnit > Number.MAX_SAFE_INTEGER) errors.push({ field: "askingPricePerUnit", message: "Asking price per unit must be a positive, safely representable BDT amount." });
  if (district.length < 2 || district.length > 80) errors.push({ field: "district", message: "District must be 2–80 characters." });
  if (upazila.length < 2 || upazila.length > 80) errors.push({ field: "upazila", message: "Upazila must be 2–80 characters." });

  if (errors.length) return { errors };
  return {
    value: {
      productName,
      description: description.trim(),
      quantity: body.quantity,
      unit: body.unit,
      askingPricePerUnit: body.askingPricePerUnit,
      district,
      upazila,
    },
  };
}

/** GET /api/v1/marketplace/products — public active listing browse. */
export async function listMarketplaceProducts(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, MAX_PAGE_SIZE);
    if (!page || !limit || (page - 1) * limit > MAX_RESULT_OFFSET) return errorResponse(res, 400, "Page and limit must be positive integers; limit cannot exceed 100 or request an excessive offset.", "INVALID_PAGINATION");

    const filter = { status: "active" };
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
