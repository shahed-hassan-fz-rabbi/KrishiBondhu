import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth.middleware.js";
import { createSavedAdvisory, deleteSavedAdvisory, listSavedAdvisories } from "../../controllers/savedadvisory.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", listSavedAdvisories);
router.post("/", rateLimit({ windowMs: 60 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }), createSavedAdvisory);
router.delete("/:id", deleteSavedAdvisory);
export default router;
