import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import pug from "pug";
import { htmlToText } from "html-to-text";
import { COMPANY_ADDRESS, COMPANY_PHONE } from "./contactDetails.js";

export type ContactSubmission = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function adminInbox(): string | null {
  const a = process.env.ADMIN_EMAIL ?? process.env.EMAIL_TO ?? "";
  return a.trim() || null;
}

export async function sendContactToAdmin(payload: ContactSubmission): Promise<void> {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_FROM) {
    console.warn("contactEmails: email not configured, skipping contact email");
    return;
  }

  const to = adminInbox();
  if (!to) {
    console.warn("contactEmails: ADMIN_EMAIL / EMAIL_TO not set, skipping contact email");
    return;
  }

  const subject = `Contact form submission — ${payload.name}`;
  const html = pug.renderFile(path.join(__dirname, "../views/email", "contactAdmin.pug"), {
    subject,
    companyName: process.env.COMPANY_NAME ?? "Obinwanne Farms",
    companyAddress: COMPANY_ADDRESS,
    companyPhone: COMPANY_PHONE,
    ...payload,
  });

  const from = `${process.env.COMPANY_NAME} <${process.env.EMAIL_FROM}>`;
  await getTransport().sendMail({
    from,
    to,
    subject,
    html,
    text: htmlToText(html),
    replyTo: payload.email,
  });
}
