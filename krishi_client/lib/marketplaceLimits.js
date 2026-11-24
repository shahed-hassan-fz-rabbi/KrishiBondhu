/**
 * Shared client-side mirror of the server's per-listing quantity cap.
 * The server remains the source of truth (MARKETPLACE_MAX_LISTING_QUANTITY).
 */
export const MAX_LISTING_QUANTITY = 1000;

export function isValidListingQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0.01 && quantity <= MAX_LISTING_QUANTITY;
}
