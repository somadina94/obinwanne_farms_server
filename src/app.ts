import express from "express";
import cors from "cors";
import globalErrorHandler from "./controllers/errorController.js";
import AppError from "./utils/appError.js";
import { handlePaystackWebhook } from "./controllers/paymentWebhookController.js";
import userRouter from "./routes/userRoutes.js";
import productRouter from "./routes/productRoutes.js";
import adminProductRouter from "./routes/adminProductRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import adminOrderRouter from "./routes/adminOrderRoutes.js";
import contactRouter from "./routes/contactRoutes.js";

import type { Request, Response, NextFunction } from "express";

const app = express();

app.use(cors());

app.post(
  "/api/v1/payments/paystack/webhook",
  express.raw({ type: "application/json" }),
  handlePaystackWebhook,
);

app.use(express.json());

app.use("/api/v1/users", userRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/admin/products", adminProductRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin/orders", adminOrderRouter);
app.use("/api/v1/contact", contactRouter);

app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
