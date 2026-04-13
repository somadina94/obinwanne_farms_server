import express from "express";

import { getActiveProducts, getProduct } from "../controllers/productController.js";

const router = express.Router();

router.get("/", getActiveProducts);
router.get("/:id", getProduct);

export default router;
