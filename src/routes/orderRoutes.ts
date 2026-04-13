import express from "express";

import {
  checkout,
  getDigitalDownloadUrl,
  getMyOrders,
  getOrder,
  verifyPayment,
} from "../controllers/orderController.js";
import { protect } from "../controllers/authController.js";

const router = express.Router();

router.use(protect);

router.post("/checkout", checkout);
router.get("/me", getMyOrders);
router.get("/verify/:reference", verifyPayment);
router.get(
  "/:orderId/products/:productId/download",
  getDigitalDownloadUrl,
);
router.get("/:orderId", getOrder);

export default router;
