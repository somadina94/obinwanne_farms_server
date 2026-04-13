import mongoose from "mongoose";

import Order from "../models/orderModel.js";
import Product from "../models/productModel.js";
import User from "../models/userModel.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import {
  initializeTransaction,
  verifyTransaction,
} from "../services/paystackService.js";
import { getAuthorizedDownloadUrl } from "../services/b2Service.js";
import { notifyLineItemDelivered } from "../utils/orderEmails.js";

import type { Request, Response, NextFunction } from "express";
import type { IOrderItem, PhysicalDeliveryStatus } from "../types/order.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `user` may be an ObjectId or a populated doc; `Document#toString()` is not the id string. */
function orderUserIdString(
  user: mongoose.Types.ObjectId | { _id: mongoose.Types.ObjectId },
): string {
  if (user instanceof mongoose.Types.ObjectId) {
    return user.toString();
  }
  return user._id.toString();
}

const allowedDeliveryUpdates: PhysicalDeliveryStatus[] = [
  "pending_payment",
  "awaiting_fulfillment",
  "processing",
  "out_for_delivery",
  "delivered",
];

export const checkout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const raw = req.body?.items;
    if (!Array.isArray(raw) || raw.length === 0) {
      return next(
        new AppError("Provide a non-empty items array: { productId, quantity }", 400),
      );
    }

    const lineInputs = raw as { productId?: string; quantity?: number }[];
    const builtItems: IOrderItem[] = [];

    for (const line of lineInputs) {
      if (!line.productId || typeof line.quantity !== "number" || line.quantity < 1) {
        return next(
          new AppError("Each item needs productId and quantity (min 1)", 400),
        );
      }

      const product = await Product.findById(line.productId);
      if (!product || !product.isActive) {
        return next(
          new AppError(`Product not available: ${line.productId}`, 400),
        );
      }

      if (
        product.type === "physical" &&
        product.stock !== null &&
        product.stock < line.quantity
      ) {
        return next(
          new AppError(`Insufficient stock for: ${product.title}`, 400),
        );
      }

      const item: IOrderItem = {
        product: product._id,
        title: product.title,
        productType: product.type,
        quantity: line.quantity,
        unitPriceNgn: product.priceNgn,
      };
      if (product.type === "physical") {
        item.deliveryStatus = "pending_payment";
      }
      builtItems.push(item);
    }

    const totalNgn = roundMoney(
      builtItems.reduce(
        (sum, i) => sum + i.unitPriceNgn * i.quantity,
        0,
      ),
    );

    if (totalNgn <= 0) {
      return next(new AppError("Order total must be greater than zero", 400));
    }

    const orderId = new mongoose.Types.ObjectId();
    const paystackReference = `order_${orderId.toHexString()}`;

    const order = await Order.create({
      _id: orderId,
      user: req.user!._id,
      items: builtItems,
      totalNgn,
      paystackReference,
      paymentStatus: "pending",
    });

    const amountKobo = Math.round(totalNgn * 100);
    const cb = process.env.PAYSTACK_CALLBACK_URL;
    const init = await initializeTransaction({
      email: req.user!.email,
      amountKobo,
      reference: paystackReference,
      ...(cb !== undefined && cb !== "" ? { callbackUrl: cb } : {}),
      metadata: { orderId: order._id.toString() },
    });

    const data = init.data as
      | {
          authorization_url?: string;
          access_code?: string;
          reference?: string;
        }
      | undefined;

    if (!init.status || !data?.authorization_url) {
      await Order.findByIdAndDelete(order._id);
      return next(
        new AppError(
          init.message || "Could not start payment. Try again later.",
          502,
        ),
      );
    }

    res.status(201).json({
      status: "success",
      data: {
        order: {
          id: order._id,
          totalNgn: order.totalNgn,
          currency: order.currency,
          paystackReference: order.paystackReference,
          paymentStatus: order.paymentStatus,
        },
        paystack: {
          authorizationUrl: data.authorization_url,
          accessCode: data.access_code,
          reference: data.reference ?? paystackReference,
        },
      },
    });
  },
);

export const getMyOrders = catchAsync(
  async (req: Request, res: Response) => {
    const orders = await Order.find({ user: req.user!._id }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      status: "success",
      results: orders.length,
      data: { orders },
    });
  },
);

export const getOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
      return next(new AppError("Invalid order ID", 400));
    }
    const order = await Order.findById(orderId)
      .populate("user", "name email phone address city state zip")
      .populate("items.product", "title type priceNgn images");

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    const isOwner =
      orderUserIdString(
        order.user as mongoose.Types.ObjectId | { _id: mongoose.Types.ObjectId },
      ) === req.user!._id.toString();
    const isAdmin = req.user!.role === "admin";
    if (!isOwner && !isAdmin) {
      return next(new AppError("Access denied", 403));
    }

    res.status(200).json({
      status: "success",
      data: { order },
    });
  },
);

export const verifyPayment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const reference = req.params.reference;
    if (typeof reference !== "string" || !reference) {
      return next(new AppError("Invalid payment reference", 400));
    }
    const order = await Order.findOne({ paystackReference: reference });

    if (!order) {
      return next(new AppError("No order found for this reference", 404));
    }

    if (order.user.toString() !== req.user!._id.toString()) {
      return next(new AppError("Access denied", 403));
    }

    const result = await verifyTransaction(reference);
    const data = result.data as { status?: string; amount?: number } | undefined;

    res.status(200).json({
      status: "success",
      data: {
        paystackStatus: result.status,
        transactionStatus: data?.status,
        order: {
          id: order._id,
          paymentStatus: order.paymentStatus,
          totalNgn: order.totalNgn,
        },
      },
    });
  },
);

export const getDigitalDownloadUrl = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId, productId } = req.params;
    if (
      typeof orderId !== "string" ||
      !orderId ||
      typeof productId !== "string" ||
      !productId
    ) {
      return next(new AppError("Invalid order or product ID", 400));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    if (order.user.toString() !== req.user!._id.toString()) {
      return next(new AppError("Access denied", 403));
    }

    if (order.paymentStatus !== "paid") {
      return next(
        new AppError("Complete payment to download this product", 403),
      );
    }

    const item = order.items.find(
      (i) =>
        i.product.toString() === productId && i.productType === "digital",
    );
    if (!item) {
      return next(
        new AppError("This digital product is not part of this order", 404),
      );
    }

    const product = await Product.findById(productId);
    if (!product?.digitalAsset) {
      return next(new AppError("Digital asset not found", 404));
    }

    const { url, expiresInSeconds } = await getAuthorizedDownloadUrl({
      bucketId: product.digitalAsset.bucketId,
      fileName: product.digitalAsset.fileName,
    });

    res.status(200).json({
      status: "success",
      data: {
        downloadUrl: url,
        expiresInSeconds,
        contentType: product.digitalAsset.contentType,
        fileName: product.digitalAsset.fileName.split("/").pop(),
      },
    });
  },
);

export const listAllOrdersAdmin = catchAsync(
  async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.paymentStatus === "pending" || req.query.paymentStatus === "paid") {
      filter.paymentStatus = req.query.paymentStatus;
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name email phone address city state zip");

    res.status(200).json({
      status: "success",
      results: orders.length,
      data: { orders },
    });
  },
);

export const updateOrderFulfillmentNotes = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { fulfillmentNotes } = req.body as { fulfillmentNotes?: string };
    if (typeof fulfillmentNotes !== "string") {
      return next(new AppError("Provide fulfillmentNotes as a string", 400));
    }

    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { fulfillmentNotes },
      { new: true, runValidators: true },
    );

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: { order },
    });
  },
);

export const updateLineItemDelivery = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { deliveryStatus } = req.body as { deliveryStatus?: string };
    if (
      typeof deliveryStatus !== "string" ||
      !allowedDeliveryUpdates.includes(deliveryStatus as PhysicalDeliveryStatus)
    ) {
      return next(
        new AppError(
          `Invalid deliveryStatus. Use one of: ${allowedDeliveryUpdates.join(", ")}`,
          400,
        ),
      );
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    if (order.paymentStatus !== "paid") {
      return next(
        new AppError("Delivery can only be tracked after payment is confirmed", 400),
      );
    }

    const itemId = req.params.itemId;
    if (typeof itemId !== "string" || !itemId) {
      return next(new AppError("Invalid line item ID", 400));
    }
    const item = order.items.find((i) => i._id?.toString() === itemId);
    if (!item) {
      return next(new AppError("No line item found with that ID", 404));
    }

    if (item.productType !== "physical") {
      return next(
        new AppError("Delivery status applies to physical products only", 400),
      );
    }

    const previousStatus = item.deliveryStatus;
    item.deliveryStatus = deliveryStatus as PhysicalDeliveryStatus;
    await order.save();

    if (
      deliveryStatus === "delivered" &&
      previousStatus !== "delivered" &&
      item.title
    ) {
      const u = await User.findById(order.user).select(
        "name email phone address city state zip",
      );
      if (u) {
        void notifyLineItemDelivered(order, {
          name: u.name,
          email: u.email,
          phone: u.phone,
          address: u.address,
          city: u.city,
          state: u.state,
          zip: u.zip,
        }, item.title);
      }
    }

    res.status(200).json({
      status: "success",
      data: { order },
    });
  },
);
