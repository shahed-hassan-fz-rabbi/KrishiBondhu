import { Router } from "express";
import { createMarketplaceProduct, listMarketplaceProducts } from "../../controllers/marketplace.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";

const router = Router();

router.get("/products", listMarketplaceProducts);
router.post("/products", authenticate, requireRole("farmer"), createMarketplaceProduct);

export default router;
