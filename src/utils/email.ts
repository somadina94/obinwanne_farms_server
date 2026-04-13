import path from "path";
import { fileURLToPath } from "url";
import pug from "pug";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";
import type { IUser } from "../types/user.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Email {
  to: string;
  firstName: string;
  from: string;
  message: string;

  constructor(user: IUser, message: string) {
    this.message = message;
    this.to = user.email;
    this.firstName = user.name?.split(" ")[0] ?? "";
    this.from = `${process.env.COMPANY_NAME} <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(
    template: string,
    subject: string,
    locals: Record<string, unknown> = {},
  ) {
    const html = pug.renderFile(
      path.join(__dirname, "../views/email", `${template}.pug`),
      {
        message: this.message,
        firstName: this.firstName,
        subject,
        ...locals,
      },
    );

    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: htmlToText(html),
    };

    try {
      await this.newTransport().sendMail(mailOptions);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async sendWelcome() {
    await this.send("welcome", `Welcome to ${process.env.COMPANY_NAME}`);
  }

  async sendPasswordReset(resetUrl: string) {
    const company = process.env.COMPANY_NAME ?? "Obinwanne Farms";
    await this.send("passwordReset", `Reset your ${company} password`, {
      resetUrl,
      companyName: company,
    });
  }
}

export default Email;
