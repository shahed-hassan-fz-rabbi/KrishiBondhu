import mongoose from "mongoose";
import { MarketplaceProduct } from "../models/marketplaceproduct.model.js";
import { MARKETPLACE_DEMO_PRODUCTS } from "../data/marketplaceDemoProducts.js";
import { errorResponse, successResponse } from "../utils/response.js";

const PUBLIC_PRODUCT_FIELDS = "productName productImageDataUrl description quantity unit askingPricePerUnit district upazila status createdAt updatedAt";
const FARMER_PRODUCT_FIELDS = "_id productName productImageDataUrl description quantity unit askingPricePerUnit district upazila status createdAt updatedAt";
const ALLOWED_UNITS = new Set(["kg", "quintal", "ton"]);
const KG_PER_UNIT = { kg: 1, quintal: 100, ton: 1000 };
const MINIMUM_LISTING_KG = 25;
const MAX_PRODUCT_IMAGE_DATA_URL_LENGTH = 140_000;
const MAX_PAGE_SIZE = 100;
const MAX_RESULT_OFFSET = 1_000_000;
const MAX_SEARCH_LENGTH = 100;
const MAX_DISTRICT_LENGTH = 80;
const ALLOWED_PRODUCT_QUERY_FIELDS = new Set(["q", "district", "page", "limit"]);
const EDITABLE_PRODUCT_FIELDS = new Set([
  "productName", "description", "quantity", "unit", "askingPricePerUnit", "district", "upazila", "status",
]);
const CHECKOUT_PREVIEW_FIELDS = "productName quantity unit askingPricePerUnit status";
const CHECKOUT_PREVIEW_BODY_FIELDS = new Set(["productId", "quantity"]);
const DEMO_MARKETPLACE_PRODUCT_IDS = new Set(MARKETPLACE_DEMO_PRODUCTS.map(({ id }) => id.toLowerCase()));
const MAX_CHECKOUT_PREVIEW_SUBTOTAL_PAISA = 100_000_000_000_000n;

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

function validateProductImageDataUrl(value) {
  if (value === undefined || value === "") return { value: "" };
  if (typeof value !== "string" || value.length > MAX_PRODUCT_IMAGE_DATA_URL_LENGTH) return { error: "Product image must be 100 KB or smaller after optimization." };
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return { error: "Product image must be a JPEG, PNG, or WebP image." };
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 100_000 || bytes.toString("base64") !== match[2]) return { error: "Product image data is invalid or too large." };
  const signatureValid = match[1] === "jpeg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === "png"
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return signatureValid ? { value } : { error: "Product image contents do not match its image type." };
}

function decimalParts(value) {
  const match = Number(value).toString().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const fraction = match[3] || "";
  const exponent = Number(match[4] || 0);
  let coefficient = BigInt(`${match[1] === "-" ? "-" : ""}${match[2]}${fraction}`);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { coefficient, scale };
}

function comparePositiveDecimals(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const leftInteger = a.coefficient * (10n ** BigInt(scale - a.scale));
  const rightInteger = b.coefficient * (10n ** BigInt(scale - b.scale));
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0;
}

/** Round a positive decimal product to the nearest BDT paisa, half up. */
function calculateSubtotalInBdt(pricePerUnit, quantity) {
  const price = decimalParts(pricePerUnit);
  const amount = decimalParts(quantity);
  if (!price || !amount || price.coefficient <= 0n || amount.coefficient <= 0n) return null;

  const numerator = price.coefficient * amount.coefficient * 100n;
  const denominator = 10n ** BigInt(price.scale + amount.scale);
  let paisa = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) paisa += 1n;
  if (paisa > MAX_CHECKOUT_PREVIEW_SUBTOTAL_PAISA) return null;
  return Number(paisa) / 100;
}

function validateCheckoutPreviewBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "A JSON object with productId and quantity is required.", code: "VALIDATION_ERROR" };
  }
  const unsupported = Object.keys(body).filter((field) => !CHECKOUT_PREVIEW_BODY_FIELDS.has(field));
  if (unsupported.length) {
    return { error: "Only productId and quantity are accepted.", code: "VALIDATION_ERROR", details: unsupported.map((field) => ({ field, message: "This field is not accepted." })) };
  }
  if (typeof body.productId !== "string" || !mongoose.isObjectIdOrHexString(body.productId)) {
    return { error: "productId must be a valid product ID.", code: "INVALID_ID" };
  }
  if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 0.01 || body.quantity > Number.MAX_SAFE_INTEGER) {
    return { error: "quantity must be a finite number of at least 0.01.", code: "VALIDATION_ERROR" };
  }
  return { value: { productId: body.productId, quantity: body.quantity } };
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
  const productImage = supplied("productImageDataUrl") ? validateProductImageDataUrl(body?.productImageDataUrl) : null;

  if (supplied("productName") && (productName.length < 2 || productName.length > 100)) errors.push({ field: "productName", message: "Product name must be 2–100 characters." });
  if (supplied("description") && (typeof description !== "string" || description.length > 2000)) errors.push({ field: "description", message: "Description must be a string of at most 2000 characters." });
  if (supplied("quantity") && (!Number.isFinite(body?.quantity) || body.quantity < 0.01 || body.quantity > Number.MAX_SAFE_INTEGER)) errors.push({ field: "quantity", message: "Quantity must be at least 0.01 and safely representable." });
  if (supplied("unit") && !ALLOWED_UNITS.has(body?.unit)) errors.push({ field: "unit", message: "Unit must be kg, quintal, or ton." });
  const effectiveUnit = body?.unit || (partial ? null : "kg");
  if (supplied("quantity") && effectiveUnit && ALLOWED_UNITS.has(effectiveUnit) && Number.isFinite(body?.quantity) && body.quantity * KG_PER_UNIT[effectiveUnit] < MINIMUM_LISTING_KG) {
    errors.push({ field: "quantity", message: `A product listing must contain at least ${MINIMUM_LISTING_KG} kg.` });
  }
  if (supplied("askingPricePerUnit") && (!Number.isFinite(body?.askingPricePerUnit) || body.askingPricePerUnit < 0.01 || body.askingPricePerUnit > Number.MAX_SAFE_INTEGER)) errors.push({ field: "askingPricePerUnit", message: "Asking price per unit must be at least 0.01 BDT and safely representable." });
  if (supplied("district") && (district.length < 2 || district.length > 80)) errors.push({ field: "district", message: "District must be 2–80 characters." });
  if (supplied("upazila") && (upazila.length < 2 || upazila.length > 80)) errors.push({ field: "upazila", message: "Upazila must be 2–80 characters." });
  if (productImage?.error) errors.push({ field: "productImageDataUrl", message: productImage.error });
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
  if (productImage) normalized.productImageDataUrl = productImage.value;
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

    const existing = await MarketplaceProduct.findOne({ _id: req.params.id, ownerId: req.user._id, status: { $ne: "archived" } }).select("quantity unit").lean();
    if (!existing) return errorResponse(res, 404, "Product listing not found.", "NOT_FOUND");
    const effectiveUnit = validation.value.unit || existing.unit;
    if (Object.hasOwn(validation.value, "quantity") && validation.value.quantity * KG_PER_UNIT[effectiveUnit] < MINIMUM_LISTING_KG) {
      return errorResponse(res, 400, "A product listing must contain at least 25 kg.", "VALIDATION_ERROR", [{ field: "quantity", message: "Quantity must equal at least 25 kg in the selected unit." }]);
    }
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

/** POST /api/v1/marketplace/checkout/preview — public, read-only informational price/stock preview. */
export async function previewMarketplaceCheckout(req, res, next) {
  try {
    const validation = validateCheckoutPreviewBody(req.body);
    if (validation.error) {
      return errorResponse(res, 400, validation.error, validation.code, validation.details);
    }

    const { productId, quantity } = validation.value;
    if (DEMO_MARKETPLACE_PRODUCT_IDS.has(productId.toLowerCase())) {
      return errorResponse(res, 409, "Fictional demo listings are not available for checkout.", "DEMO_PRODUCT_UNAVAILABLE");
    }

    const product = await MarketplaceProduct.findById(productId).select(CHECKOUT_PREVIEW_FIELDS).lean();
    if (!product) return errorResponse(res, 404, "Product listing not found.", "NOT_FOUND");
    if (product.status !== "active") {
      return errorResponse(res, 409, "This product listing is not currently available.", "PRODUCT_UNAVAILABLE");
    }
    const stockComparison = comparePositiveDecimals(quantity, product.quantity);
    if (stockComparison === null) {
      return errorResponse(res, 400, "Product quantity cannot be safely calculated.", "VALIDATION_ERROR");
    }
    if (stockComparison > 0) {
      return errorResponse(res, 409, "Requested quantity exceeds the available stock.", "INSUFFICIENT_STOCK", {
        requestedQuantity: quantity,
        availableQuantity: product.quantity,
        unit: product.unit,
      });
    }

    const subtotal = calculateSubtotalInBdt(product.askingPricePerUnit, quantity);
    if (subtotal === null) {
      return errorResponse(res, 400, "Subtotal exceeds the supported BDT precision range.", "VALIDATION_ERROR");
    }

    return successResponse(res, 200, {
      productName: product.productName,
      unit: product.unit,
      requestedQuantity: quantity,
      availableQuantity: product.quantity,
      askingPricePerUnit: product.askingPricePerUnit,
      subtotal,
      currency: "BDT",
      rounding: "nearest_0.01_bdt_half_up",
      priceLabel: "farmer_set_asking_price_not_DAM_verified",
      availability: { available: true, status: "active" },
      previewOnly: true,
      orderConfirmed: false,
      priceLocked: false,
      stockReserved: false,
    });
  } catch (error) {
    return next(error);
  }
}
