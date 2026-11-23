/**
 * SMS Subscription Routes — mounted at /api/v1/sms-subscriptions.
 * All endpoints require an authenticated farmer and only ever act on req.user.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { requireSameOrigin } from "../../middleware/csrf.middleware.js";
import { smsSubscriptionController } from "../../controllers/smsSubscription.controller.js";
import { env } from "../../config/env.config.js";

const router = Router();

const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  message: {
    success: false,
    error: { code: "TOO_MANY_REQUESTS", message: "Too many subscription changes, please try again later" },
  },
});

router.use(authenticate);
router.use(requireRole("farmer"));

router.get("/", subscriptionLimiter, smsSubscriptionController.getPreferences);
router.patch("/:category", subscriptionLimiter, requireSameOrigin, smsSubscriptionController.updateCategory);
router.post("/unsubscribe-all", subscriptionLimiter, requireSameOrigin, smsSubscriptionController.unsubscribeAll);

export default router;
