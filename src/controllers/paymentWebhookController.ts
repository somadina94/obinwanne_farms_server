import crypto from "crypto";

import Order from "../models/orderModel.js";
import Product from "../models/productModel.js";
import User from "../models/userModel.js";
import { verifyTransaction } from "../services/paystackService.js";
import catchAsync from "../utils/catchAsync.js";
import { notifyOrderPaid } from "../utils/orderEmails.js";

import type { Request, Response } from "express";

/**
 * Paystack webhook — must be registered with `express.raw({ type: 'application/json' })`
 * so HMAC verification uses the exact request bytes.
 */
export const handlePaystackWebhook = catchAsync(
  async (req: Request, res: Response) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ message: "Server misconfiguration" });
    }

    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).json({ message: "Invalid body" });
    }

    const signature = req.headers["x-paystack-signature"];
    if (typeof signature !== "string") {
      return res.status(400).json({ message: "Missing signature" });
    }

    const hash = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    if (hash !== signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    let payload: {
      event?: string;
      data?: { reference?: string; amount?: number; status?: string };
    };
    try {
      payload = JSON.parse(raw.toString("utf8")) as typeof payload;
    } catch {
      return res.status(400).json({ message: "Invalid JSON" });
    }

    if (payload.event !== "charge.success") {
      return res.status(200).json({ received: true });
    }

    const reference = payload.data?.reference;
    if (!reference) {
      return res.status(200).json({ received: true });
    }

    const verify = await verifyTransaction(reference);
    const pdata = verify.data as
      | { status?: string; amount?: number; reference?: string }
      | undefined;

    if (!verify.status || pdata?.status !== "success") {
      return res.status(200).json({ received: true });
    }

    const order = await Order.findOne({ paystackReference: reference });
    if (!order) {
      return res.status(200).json({ received: true });
    }

    if (order.paymentStatus === "paid") {
      return res.status(200).json({ received: true });
    }

    const expectedKobo = Math.round(order.totalNgn * 100);
    const amountKobo = Number(pdata?.amount);
    if (amountKobo !== expectedKobo) {
      console.error(
        `Paystack amount mismatch for order ${order._id.toString()}: expected ${expectedKobo}, got ${String(pdata?.amount)}`,
      );
      return res.status(200).json({ received: true });
    }

    for (const item of order.items) {
      if (item.productType === "physical") {
        const r = await Product.updateOne(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
        );
        if (r.modifiedCount !== 1) {
          console.error(
            `Stock decrement failed for order ${order._id.toString()} product ${item.product.toString()}`,
          );
        }
        item.deliveryStatus = "awaiting_fulfillment";
      }
    }

    order.paymentStatus = "paid";
    order.paidAt = new Date();
    await order.save();

    const buyer = await User.findById(order.user).select(
      "name email phone address city state zip",
    );
    if (buyer) {
      void notifyOrderPaid(order, {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        address: buyer.address,
        city: buyer.city,
        state: buyer.state,
        zip: buyer.zip,
      });
    }

    return res.status(200).json({ received: true });
  },
);
