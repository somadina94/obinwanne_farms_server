import type { Document, Types } from "mongoose";

export type PaymentStatus = "pending" | "paid" | "failed" | "abandoned";

export type PhysicalDeliveryStatus =
  | "pending_payment"
  | "awaiting_fulfillment"
  | "processing"
  | "out_for_delivery"
  | "delivered";

export interface IOrderItem {
  _id?: Types.ObjectId;
  product: Types.ObjectId;
  title: string;
  productType: "digital" | "physical";
  quantity: number;
  unitPriceNgn: number;
  /** Only for physical line items */
  deliveryStatus?: PhysicalDeliveryStatus;
}

export interface IOrder extends Document {
  user: Types.ObjectId;
  items: IOrderItem[];
  totalNgn: number;
  currency: string;
  paystackReference: string;
  paymentStatus: PaymentStatus;
  paidAt?: Date | null;
  /** Admin notes (e.g. courier, internal reference) */
  fulfillmentNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
