import express from "express";
import multer from "multer";

import {
  createDigitalProduct,
  createPhysicalProduct,
  deactivateProduct,
  deleteProductPermanent,
  getAllProductsAdmin,
  getProductAdmin,
  updateProduct,
} from "../controllers/productController.js";
import { protect, restrictTo } from "../controllers/authController.js";

const digitalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 52 * 1024 * 1024 },
});

const physicalImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for product photos"));
    }
  },
});

function maybePhysicalImages(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (req.is("multipart/form-data")) {
    return physicalImageUpload.array("images", 12)(req, res, next);
  }
  next();
}

const router = express.Router();

router.use(protect);
router.use(restrictTo("admin"));

router.get("/", getAllProductsAdmin);
router.get("/:id", getProductAdmin);
router.post("/", maybePhysicalImages, createPhysicalProduct);
router.post("/digital", digitalUpload.single("file"), createDigitalProduct);
router.patch("/:id", maybePhysicalImages, updateProduct);
router.delete("/:id/permanent", deleteProductPermanent);
router.delete("/:id", deactivateProduct);

export default router;
