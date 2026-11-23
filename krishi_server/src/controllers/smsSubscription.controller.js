import { SmsPreferences } from "../models/smsPreferences.model.js";
import { errorResponse, successResponse } from "../utils/response.js";
import { maskPhone } from "../services/sms/smsPreferences.js";
import {
  applyCategoryChange,
  applyUnsubscribeAll,
  assertPhoneVerified,
  toPublicSmsPreferences,
  toModelPatch,
  validateCategoryUpdate,
} from "../services/sms/smsSubscription.service.js";

/**
 * SMS subscription controller factory.
 * The model is injectable so API tests can run without MongoDB.
 * All user identity comes from req.user (set by authenticate) — a caller can
 * never supply or change another user's userId.
 */
export function createSmsSubscriptionController({ model = SmsPreferences, now = () => new Date() } = {}) {
  async function loadPreferences(userId) {
    return model.findOne({ userId });
  }

  async function savePreferences(userId, user, patch) {
    const stamp = now();
    const stored = toModelPatch(patch);
    const contact = {
      phoneLast4: maskPhone(user.phone),
      phoneVerifiedAtSnapshot: user.phoneVerifiedAt || null,
      updatedAt: stamp,
    };
    const existing = await loadPreferences(userId);
    if (existing) {
      Object.assign(existing, stored, contact);
      await existing.save();
      return existing;
    }
    return model.create({
      userId,
      ...stored,
      ...contact,
      createdAt: stamp,
    });
  }

  return {
    async getPreferences(req, res, next) {
      try {
        const doc = await loadPreferences(req.user._id);
        return successResponse(res, 200, {
          preferences: toPublicSmsPreferences({ preferences: doc || {}, user: req.user, now: now() }),
        });
      } catch (error) { return next(error); }
    },

    async updateCategory(req, res, next) {
      try {
        const validated = validateCategoryUpdate(req.params, req.body);
        if (!validated.ok) return errorResponse(res, 400, validated.message, validated.code);

        if (validated.enabled) {
          const verified = assertPhoneVerified(req.user, { now: now() });
          if (!verified.ok) return errorResponse(res, 422, verified.message, verified.code);
        }

        const existing = await loadPreferences(req.user._id);
        const patch = applyCategoryChange(existing || {}, validated, { now: now() });
        const saved = await savePreferences(req.user._id, req.user, patch);
        return successResponse(res, 200, {
          preferences: toPublicSmsPreferences({ preferences: saved, user: req.user, now: now() }),
        });
      } catch (error) { return next(error); }
    },

    async unsubscribeAll(req, res, next) {
      try {
        const existing = await loadPreferences(req.user._id);
        const patch = applyUnsubscribeAll(existing || {}, { now: now() });
        const saved = await savePreferences(req.user._id, req.user, patch);
        return successResponse(res, 200, {
          preferences: toPublicSmsPreferences({ preferences: saved, user: req.user, now: now() }),
        }, { message: "Unsubscribed from all SMS alerts" });
      } catch (error) { return next(error); }
    },
  };
}

// Default instance used by the router.
export const smsSubscriptionController = createSmsSubscriptionController();
