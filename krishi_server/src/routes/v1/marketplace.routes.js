import { Router } from "express";
import {
  archiveMarketplaceProduct,
  createMarketplaceOrderRequest,
  createMarketplaceProduct,
  listAdminMarketplaceProducts,
  listMarketplaceProducts,
  listMyMarketplaceOrderRequests,
  listMyMarketplaceProducts,
  previewMarketplaceCheckout,
  reviewMarketplaceProduct,
  updateMarketplaceProduct,
} from "../../controllers/marketplace.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";

const router = Router();

router.post("/checkout/preview", previewMarketplaceCheckout);
router.get("/products", listMarketplaceProducts);

// Admin moderation: only admins may review listings.
router.get("/admin/products", authenticate, requireRole("admin"), listAdminMarketplaceProducts);
router.patch("/admin/products/:id/review", authenticate, requireRole("admin"), reviewMarketplaceProduct);

// Buy now: any signed-in, phone-verified user may place an intent request.
router.post("/orders", authenticate, createMarketplaceOrderRequest);
router.get("/orders/mine", authenticate, listMyMarketplaceOrderRequests);

router.get("/products/mine", authenticate, requireRole("farmer"), listMyMarketplaceProducts);
router.post("/products", authenticate, requireRole("farmer"), createMarketplaceProduct);
router.patch("/products/:id", authenticate, requireRole("farmer"), updateMarketplaceProduct);
router.delete("/products/:id", authenticate, requireRole("farmer"), archiveMarketplaceProduct);

export default router;
