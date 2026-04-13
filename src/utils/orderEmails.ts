import path from "path";
import { fileURLToPath } from "url";
import pug from "pug";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";

import type { IOrder } from "../types/order.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CustomerForEmail = {
  name?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    auth: {
      user: process.env.EMAIL_ADDRESS,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

export function formatCustomerAddress(c: CustomerForEmail): string {
  const parts = [c.address, c.city, c.state, c.zip].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "—";
}

function adminInbox(): string | null {
  const a = process.env.ADMIN_EMAIL ?? process.env.EMAIL_TO ?? "";
  return a.trim() || null;
}

function renderTemplate(template: string, locals: Record<string, unknown>): string {
  return pug.renderFile(
    path.join(__dirname, "../views/email", `${template}.pug`),
    {
      ...locals,
      companyName: process.env.COMPANY_NAME ?? "Obinwanne Farms",
    },
  );
}

async function sendHtml(to: string, subject: string, html: string): Promise<void> {
  const from = `${process.env.COMPANY_NAME} <${process.env.EMAIL_FROM}>`;
  await getTransport().sendMail({
    from,
    to,
    subject,
    html,
    text: htmlToText(html),
  });
}

function itemRowsForOrder(order: IOrder) {
  return order.items.map((i) => {
    const line = Math.round(i.unitPriceNgn * i.quantity * 100) / 100;
    return {
      title: i.title,
      productType: i.productType,
      quantity: i.quantity,
      lineLabel: line.toLocaleString("en-NG"),
    };
  });
}

export async function notifyOrderPaid(
  order: IOrder,
  customer: CustomerForEmail,
): Promise<void> {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_FROM) {
    console.warn("orderEmails: email not configured, skipping paid notifications");
    return;
  }

  const firstName = customer.name?.split(" ")[0] ?? "there";
  const totalLabel = order.totalNgn.toLocaleString("en-NG");
  const addressLine = formatCustomerAddress(customer);
  const itemRows = itemRowsForOrder(order);

  const commonLocals = {
    subject: "", // set per template via base
    orderRef: order.paystackReference,
    orderId: order._id.toString(),
    totalLabel,
    itemRows,
    customerName: customer.name ?? "—",
    customerEmail: customer.email,
    customerPhone: customer.phone?.trim() || "—",
    addressLine,
    firstName,
  };

  try {
    const htmlUser = renderTemplate("orderPaidCustomer", {
      ...commonLocals,
      subject: `Payment received — ${order.paystackReference}`,
    });
    await sendHtml(
      customer.email,
      `Payment received — ${order.paystackReference}`,
      htmlUser,
    );
  } catch (e) {
    console.error("notifyOrderPaid customer email failed:", e);
  }

  const adminTo = adminInbox();
  if (!adminTo) {
    console.warn("notifyOrderPaid: ADMIN_EMAIL / EMAIL_TO not set, skipping admin email");
    return;
  }
  try {
    const htmlAdmin = renderTemplate("orderPaidAdmin", {
      ...commonLocals,
      subject: `New paid order — ${order.paystackReference}`,
    });
    await sendHtml(adminTo, `New paid order — ${order.paystackReference}`, htmlAdmin);
  } catch (e) {
    console.error("notifyOrderPaid admin email failed:", e);
  }
}

export async function notifyLineItemDelivered(
  order: IOrder,
  customer: CustomerForEmail,
  itemTitle: string,
): Promise<void> {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_FROM) {
    console.warn("orderEmails: email not configured, skipping delivered notifications");
    return;
  }

  const firstName = customer.name?.split(" ")[0] ?? "there";
  const addressLine = formatCustomerAddress(customer);
  const locals = {
    subject: "",
    orderRef: order.paystackReference,
    orderId: order._id.toString(),
    itemTitle,
    addressLine,
    customerName: customer.name ?? "—",
    customerEmail: customer.email,
    customerPhone: customer.phone?.trim() || "—",
    firstName,
  };

  try {
    const htmlUser = renderTemplate("orderDeliveredCustomer", {
      ...locals,
      subject: `Delivered: ${itemTitle}`,
    });
    await sendHtml(
      customer.email,
      `Delivered: ${itemTitle} — ${order.paystackReference}`,
      htmlUser,
    );
  } catch (e) {
    console.error("notifyLineItemDelivered customer email failed:", e);
  }

  const adminTo = adminInbox();
  if (!adminTo) {
    console.warn(
      "notifyLineItemDelivered: ADMIN_EMAIL / EMAIL_TO not set, skipping admin email",
    );
    return;
  }
  try {
    const htmlAdmin = renderTemplate("orderDeliveredAdmin", {
      ...locals,
      subject: `Marked delivered — ${itemTitle}`,
    });
    await sendHtml(
      adminTo,
      `Marked delivered — ${itemTitle} (${order.paystackReference})`,
      htmlAdmin,
    );
  } catch (e) {
    console.error("notifyLineItemDelivered admin email failed:", e);
  }
}
