import express from "express";

import {
  listAllOrdersAdmin,
  updateLineItemDelivery,
  updateOrderFulfillmentNotes,
} from "../controllers/orderController.js";
import { protect, restrictTo } from "../controllers/authController.js";

const router = express.Router();

router.use(protect);
router.use(restrictTo("admin"));

router.get("/", listAllOrdersAdmin);
router.patch("/:orderId/fulfillment-notes", updateOrderFulfillmentNotes);
router.patch(
  "/:orderId/items/:itemId/delivery",
  updateLineItemDelivery,
);

export default router;
