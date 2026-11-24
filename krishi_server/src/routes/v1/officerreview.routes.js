import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import {
  createOfficerReview,
  listMyOfficerReviews,
  getOfficerReviewById,
  updateOfficerReview,
  deleteOfficerReview,
  listOfficerReviewQueue,
  submitOfficerReview,
} from "../../controllers/officerreview.controller.js";

const router = Router();
router.use(authenticate);

router.get("/mine", listMyOfficerReviews);
router.post(
  "/",
  requireRole("farmer"),
  rateLimit({ windowMs: 60 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }),
  createOfficerReview
);
router.get("/queue", requireRole("extension_officer", "admin"), listOfficerReviewQueue);
router.get("/:id", getOfficerReviewById);
router.patch("/:id", requireRole("farmer"), updateOfficerReview);
router.delete("/:id", requireRole("farmer"), deleteOfficerReview);
router.patch("/:id/respond", requireRole("extension_officer", "admin"), submitOfficerReview);

export default router;
