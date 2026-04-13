import mongoose, { Model } from "mongoose";

import type { IProduct } from "../types/product.js";

const digitalAssetSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    bucketId: { type: String, required: true },
    contentType: { type: String, required: true },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema<IProduct>(
  {
    title: {
      type: String,
      required: [true, "A product must have a title"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "A product must have a description"],
    },
    type: {
      type: String,
      enum: ["digital", "physical"],
      required: true,
    },
    priceNgn: {
      type: Number,
      required: [true, "A product must have a price"],
      min: [0, "Price cannot be negative"],
    },
    images: {
      type: [String],
      default: [],
    },
    /** Index into `images` for card thumbnail and default gallery slide */
    primaryImageIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
    stock: {
      type: Number,
      default: null,
      min: [0, "Stock cannot be negative"],
    },
    digitalAsset: {
      type: digitalAssetSchema,
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

productSchema.pre("save", function () {
  if (this.type === "digital") {
    this.stock = null;
  }
});

const Product: Model<IProduct> = mongoose.model<IProduct>("Product", productSchema);
export default Product;
