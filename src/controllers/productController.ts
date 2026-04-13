import Product from "../models/productModel.js";
import Order from "../models/orderModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import {
  uploadDigitalToB2,
  uploadProductImageToB2,
  uniquePhysicalImageKey,
} from "../services/b2Service.js";

import type { Request, Response, NextFunction } from "express";
const publicSelect = "-digitalAsset";

function toSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "product";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 0;
  while (await Product.exists({ slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export const getActiveProducts = catchAsync(
  async (req: Request, res: Response) => {
    const query: Record<string, unknown> = { isActive: true };
    if (req.query.type === "digital" || req.query.type === "physical") {
      query.type = req.query.type;
    }
    const products = await Product.find(query)
      .select(publicSelect)
      .sort({ createdAt: -1 });
    res.status(200).json({
      status: "success",
      results: products.length,
      data: { products },
    });
  },
);

export const getProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id) {
      return next(new AppError("Invalid product ID", 400));
    }
    const product = await Product.findOne({
      _id: id,
      isActive: true,
    }).select(publicSelect);

    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { product },
    });
  },
);

export const getAllProductsAdmin = catchAsync(
  async (_req: Request, res: Response) => {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({
      status: "success",
      results: products.length,
      data: { products },
    });
  },
);

export const getProductAdmin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id) {
      return next(new AppError("Invalid product ID", 400));
    }
    const product = await Product.findById(id);
    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }
    res.status(200).json({
      status: "success",
      data: { product },
    });
  },
);

function clampPrimaryIndex(index: number, imageCount: number): number {
  if (imageCount <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), imageCount - 1));
}

export const createPhysicalProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as Record<string, unknown>;
    const title = body.title;
    const description = body.description;
    const priceNgn =
      typeof body.priceNgn === "number"
        ? body.priceNgn
        : Number(body.priceNgn);
    const stock =
      typeof body.stock === "number" ? body.stock : Number(body.stock);
    const slugBody = body.slug;

    if (
      typeof title !== "string" ||
      typeof description !== "string" ||
      Number.isNaN(priceNgn) ||
      Number.isNaN(stock)
    ) {
      return next(
        new AppError(
          "Provide title, description, priceNgn (number), and stock (number)",
          400,
        ),
      );
    }

    const slug =
      typeof slugBody === "string" && slugBody.trim()
        ? await uniqueSlug(toSlug(slugBody))
        : await uniqueSlug(toSlug(title));

    const imageUrls: string[] = [];

    const files = req.files;
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        if (!file.mimetype.startsWith("image/")) {
          return next(
            new AppError(
              `Only image uploads are allowed for photos: ${file.originalname}`,
              400,
            ),
          );
        }
        const { publicUrl } = await uploadProductImageToB2({
          buffer: file.buffer,
          fileName: uniquePhysicalImageKey(file.originalname),
          contentType: file.mimetype,
        });
        imageUrls.push(publicUrl);
      }
    } else if (Array.isArray(body.images)) {
      for (const u of body.images) {
        if (typeof u === "string") {
          imageUrls.push(u);
        }
      }
    }

    let primaryImageIndex = 0;
    if (imageUrls.length > 0 && body.primaryImageIndex !== undefined && body.primaryImageIndex !== "") {
      const n = Number(body.primaryImageIndex);
      if (!Number.isNaN(n)) {
        primaryImageIndex = clampPrimaryIndex(n, imageUrls.length);
      }
    }

    const product = await Product.create({
      title,
      description,
      type: "physical",
      priceNgn,
      stock,
      images: imageUrls,
      primaryImageIndex,
      slug,
    });

    res.status(201).json({
      status: "success",
      data: { product },
    });
  },
);

export const createDigitalProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file?.buffer) {
      return next(new AppError("Please upload a file (e.g. PDF)", 400));
    }

    const { title, description, priceNgn, slug: slugBody } = req.body as {
      title?: string;
      description?: string;
      priceNgn?: string;
      slug?: string;
    };

    if (!title || !description || priceNgn === undefined) {
      return next(
        new AppError("Provide title, description, and priceNgn", 400),
      );
    }

    const price = Number(priceNgn);
    if (Number.isNaN(price) || price < 0) {
      return next(new AppError("priceNgn must be a valid non-negative number", 400));
    }

    const safeName =
      req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
    const prefix = `${Date.now()}-`;
    const b2Name = `digital/${prefix}${safeName}`;

    const asset = await uploadDigitalToB2({
      buffer: req.file.buffer,
      fileName: b2Name,
      contentType: req.file.mimetype || "application/octet-stream",
    });

    const slug =
      slugBody && String(slugBody).trim()
        ? await uniqueSlug(toSlug(String(slugBody)))
        : await uniqueSlug(toSlug(title));

    const product = await Product.create({
      title,
      description,
      type: "digital",
      priceNgn: price,
      stock: null,
      images: [],
      slug,
      digitalAsset: {
        fileId: asset.fileId,
        fileName: asset.fileName,
        bucketId: asset.bucketId,
        contentType: asset.contentType,
      },
    });

    res.status(201).json({
      status: "success",
      data: { product },
    });
  },
);

export const updateProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const allowed = [
      "title",
      "description",
      "priceNgn",
      "stock",
      "isActive",
      "slug",
      "primaryImageIndex",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const files = req.files;
    if (Array.isArray(files) && files.length > 0) {
      const body = req.body as Record<string, unknown>;
      let existing: string[] = [];
      const raw = body.existingImages ?? body.images;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            existing = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          existing = [];
        }
      } else if (Array.isArray(raw)) {
        existing = raw.filter((x): x is string => typeof x === "string");
      }

      const uploaded: string[] = [];
      for (const file of files) {
        if (!file.mimetype.startsWith("image/")) {
          return next(
            new AppError(
              `Only image uploads are allowed for photos: ${file.originalname}`,
              400,
            ),
          );
        }
        const { publicUrl } = await uploadProductImageToB2({
          buffer: file.buffer,
          fileName: uniquePhysicalImageKey(file.originalname),
          contentType: file.mimetype,
        });
        uploaded.push(publicUrl);
      }
      updates.images = [...existing, ...uploaded];
    } else if (req.body.images !== undefined) {
      updates.images = req.body.images;
    }

    if (typeof updates.slug === "string" && updates.slug.trim()) {
      updates.slug = await uniqueSlug(toSlug(updates.slug));
    }

    const id = req.params.id;
    if (typeof id !== "string" || !id) {
      return next(new AppError("Invalid product ID", 400));
    }

    if (
      updates.images !== undefined ||
      updates.primaryImageIndex !== undefined
    ) {
      const existing = await Product.findById(id).select("images primaryImageIndex");
      if (!existing) {
        return next(new AppError("No product found with that ID", 404));
      }
      const mergedImages = Array.isArray(updates.images)
        ? (updates.images as string[])
        : existing.images;
      const rawPi =
        updates.primaryImageIndex !== undefined
          ? Number(updates.primaryImageIndex)
          : (existing.primaryImageIndex ?? 0);
      updates.primaryImageIndex = clampPrimaryIndex(
        Number.isNaN(rawPi) ? 0 : rawPi,
        mergedImages.length,
      );
    }

    const product = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { product },
    });
  },
);

export const deactivateProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id) {
      return next(new AppError("Invalid product ID", 400));
    }
    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );

    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      message: "Product deactivated",
      data: { product },
    });
  },
);

/** Removes the product document. Blocked when any order line references this product. */
export const deleteProductPermanent = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id) {
      return next(new AppError("Invalid product ID", 400));
    }
    const orderCount = await Order.countDocuments({ "items.product": id });
    if (orderCount > 0) {
      return next(
        new AppError(
          "This product cannot be permanently deleted because it appears on one or more orders. Remove it from the catalog instead (deactivate).",
          400,
        ),
      );
    }
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return next(new AppError("No product found with that ID", 404));
    }
    res.status(200).json({
      status: "success",
      message: "Product deleted permanently",
    });
  },
);
