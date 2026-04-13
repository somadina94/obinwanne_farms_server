import mongoose, { Model } from "mongoose";

import type { IOrder, PhysicalDeliveryStatus } from "../types/order.js";

const physicalStatuses: PhysicalDeliveryStatus[] = [
  "pending_payment",
  "awaiting_fulfillment",
  "processing",
  "out_for_delivery",
  "delivered",
];

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    title: { type: String, required: true },
    productType: {
      type: String,
      enum: ["digital", "physical"],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceNgn: { type: Number, required: true, min: 0 },
    deliveryStatus: {
      type: String,
      enum: physicalStatuses,
    },
  },
  { _id: true },
);

const orderSchema = new mongoose.Schema<IOrder>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: {
      type: [orderItemSchema],
      validate: [(val: unknown[]) => val.length > 0, "Order must have at least one item"],
    },
    totalNgn: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    paystackReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "abandoned"],
      default: "pending",
    },
    paidAt: { type: Date, default: null },
    fulfillmentNotes: { type: String, maxlength: 2000 },
  },
  { timestamps: true },
);

const Order: Model<IOrder> = mongoose.model<IOrder>("Order", orderSchema);
export default Order;
