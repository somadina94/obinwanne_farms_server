import type { Request, Response, NextFunction } from "express";

import { sendContactToAdmin } from "../utils/contactEmails.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

export const submitContact = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !phone || !message) {
      return next(new AppError("Provide name, email, phone, and message", 400));
    }
    if (message.length < 20) {
      return next(new AppError("Message should be at least 20 characters", 400));
    }

    await sendContactToAdmin({ name, email, phone, message });

    res.status(200).json({
      status: "success",
      message: "Thank you. Your message has been sent.",
    });
  },
);
