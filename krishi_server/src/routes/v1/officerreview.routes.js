import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { createOfficerReview, listMyOfficerReviews, listOfficerReviewQueue, submitOfficerReview } from "../../controllers/officerreview.controller.js";

const router = Router();
router.use(authenticate);
router.get("/mine", listMyOfficerReviews);
router.post("/", requireRole("farmer"), rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false }), createOfficerReview);
router.get("/queue", requireRole("extension_officer", "admin"), listOfficerReviewQueue);
router.patch("/:id/respond", requireRole("extension_officer", "admin"), submitOfficerReview);
export default router;
