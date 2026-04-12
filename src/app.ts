import express from "express";
import cors from "cors";
import globalErrorHandler from "./controllers/errorController.js";
import AppError from "./utils/appError.js";
import userRouter from "./routes/userRoutes.js";

import type { Request, Response, NextFunction } from "express";

const app = express();

app.use(cors());

app.use(express.json());

app.use("/api/v1/users", userRouter);

app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;
