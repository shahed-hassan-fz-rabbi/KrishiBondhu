import { Router } from "express";
import { archiveMarketplaceProduct, createMarketplaceProduct, listMarketplaceProducts, listMyMarketplaceProducts, previewMarketplaceCheckout, updateMarketplaceProduct } from "../../controllers/marketplace.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";

const router = Router();

router.post("/checkout/preview", previewMarketplaceCheckout);
router.get("/products", listMarketplaceProducts);
router.get("/products/mine", authenticate, requireRole("farmer"), listMyMarketplaceProducts);
router.post("/products", authenticate, requireRole("farmer"), createMarketplaceProduct);
router.patch("/products/:id", authenticate, requireRole("farmer"), updateMarketplaceProduct);
router.delete("/products/:id", authenticate, requireRole("farmer"), archiveMarketplaceProduct);

export default router;
