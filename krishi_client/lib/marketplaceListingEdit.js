const EDITABLE_NUMERIC_FIELDS = ["askingPricePerUnit", "quantity"];
const MIN_LISTING_VALUE = 0.01;
const KG_PER_UNIT = { kg: 1, quintal: 100, ton: 1000 };
const MAX_LISTING_VALUE = Number.MAX_SAFE_INTEGER;

function numericValue(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return Number(value);
}

export function validateMarketplaceListingEdit(draft, messages, unit = "kg") {
  const errors = {};
  for (const field of EDITABLE_NUMERIC_FIELDS) {
    const value = numericValue(draft?.[field]);
    const belowMinimumStock = field === "quantity" && Number.isFinite(value) && value * KG_PER_UNIT[unit] < 25;
    if (!Number.isFinite(value) || value < MIN_LISTING_VALUE || value > MAX_LISTING_VALUE || belowMinimumStock) errors[field] = messages[field];
  }
  return errors;
}

/** Return only changed, permitted numeric fields for an owned listing. */
export function buildMarketplaceListingEditPatch(draft, currentProduct) {
  const patch = {};
  for (const field of EDITABLE_NUMERIC_FIELDS) {
    const nextValue = numericValue(draft?.[field]);
    const currentValue = Number(currentProduct?.[field]);
    if (Number.isFinite(nextValue) && nextValue !== currentValue) patch[field] = nextValue;
  }
  return patch;
}
