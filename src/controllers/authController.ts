import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/userModel.js";
import Email from "../utils/email.js";

import type { IUser } from "../types/user.js";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
// A helper function to sign jwt
const signToken = (id: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign({ id }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? "90d",
  } as SignOptions);
};

// A function to send reponse with token
const createSendToken = (
  user: IUser,
  statusCode: number,
  req: Request,
  res: Response,
  message: string,
) => {
  const token = signToken(user._id.toString());

  user.password = "";

  res.status(statusCode).json({
    status: "success",
    message: message,
    token,
    data: {
      user,
    },
  });
};

// SIGN UP
export const signUp = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Create user
    const user: IUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
    });

    // Send welcome email
    try {
      await new Email(user, "").sendWelcome();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.log(error.message);
      } else {
        console.log("Unknown error:", error);
      }
    }

    // Send response
    const message = `Signed up successfully`;
    createSendToken(user, 201, req, res, message);
  },
);

// LOGIN
export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Get user email and password
    const { email, password } = req.body;

    // Check if email and password is provided
    if (!email || !password) {
      return next(new AppError("Please provide your email and password", 400));
    }

    // Get user by email and select password
    const user = await User.findOne({ email: email }).select("+password");

    // Check is user exists and if password is correct
    if (!user || !(await user.correctPassword(password, user.password))) {
      return next(new AppError("Incorrect email or password", 401));
    }

    // Send response
    const message = "Logged in successfully";
    createSendToken(user, 200, req, res, message);
  },
);

// PROTECT MIDDLEWARE
export const protect = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1) Check if token exists and get token
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(
        new AppError("Access denied, please login to get access.", 401),
      );
    }

    // 2) Check if token is valid
    let decodedJWT: JwtPayload;

    try {
      decodedJWT = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    } catch {
      return next(
        new AppError("Invalid or expired token. Please log in again.", 401),
      );
    }

    const currentUser = await User.findOne({ _id: decodedJWT.id });

    // 3) Check if user still exists
    if (!currentUser) {
      return next(new AppError("User no longer exists", 401));
    }

    // 4) Check if user recently changed password.
    if (decodedJWT.iat && currentUser.changedPasswordAfterJWT(decodedJWT.iat)) {
      return next(
        new AppError("You recently changed password, please login again.", 401),
      );
    }

    // All being set, grant access to protected route.
    req.user = currentUser;
    next();
  },
);

// LOGOUT
export const logout = (req: Request, res: Response) => {
  const token = "loggedout";
  res.status(200).json({
    status: "success",
    message: "Goodbye, see you next time, goodluck",
    token,
  });
};

// RESTRICT PERMISSION
export const restrictTo = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Access denied", 403));
    }
    next();
  };
};

// UPDATE PASSWORD
export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1) Get user from collection
    const user: IUser = await User.findById(req.user?._id).select("+password");

    // 2) Check if posted current password is correct
    if (
      !(await user.correctPassword(req.body.passwordCurrent, user.password))
    ) {
      return next(new AppError("Your current password is wrong.", 401));
    }
    if (req.body.password !== req.body.passwordConfirm) {
      return next(
        new AppError(
          "Your new password and confirm new password are not the same",
          401,
        ),
      );
    }

    // 3) If correct, update password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();

    // 4) log user in, send jwt
    const message = "Password changed successfully.";
    createSendToken(user, 200, req, res, message);
  },
);

const forgotPasswordResponseMessage =
  "If an account exists for this email, you will receive password reset instructions shortly.";

// FORGOT PASSWORD
export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return next(new AppError("Please provide your email", 400));
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(200).json({
        status: "success",
        message: forgotPasswordResponseMessage,
      });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      const frontendBase = (
        process.env.FRONTEND_URL ?? "http://localhost:3000"
      ).replace(/\/$/, "");
      const resetUrl = `${frontendBase}/reset-password?token=${encodeURIComponent(resetToken)}`;
      await new Email(user, "").sendPasswordReset(resetUrl);
      res.status(200).json({
        status: "success",
        message: forgotPasswordResponseMessage,
      });
    } catch (err) {
      console.error(err);
      user.passwordResetToken = null;
      user.passwordResetTokenExpires = null;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          "There was an error sending the reset email. Please try again later.",
          500,
        ),
      );
    }
  },
);

// RESET PASSWORD
export const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { token, password, passwordConfirm } = req.body;
    if (!token || typeof token !== "string") {
      return next(new AppError("Invalid or missing reset token.", 400));
    }
    if (!password || !passwordConfirm) {
      return next(
        new AppError("Please provide your new password and confirmation.", 400),
      );
    }
    if (password !== passwordConfirm) {
      return next(
        new AppError("Your new password and confirmation do not match.", 400),
      );
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpires: { $gt: Date.now() },
    });

    // 2) If token has not expired and there is user, set the new pin
    if (!user) {
      return next(new AppError("Token is invalid or has expired.", 400));
    }

    user.password = password;
    user.passwordConfirm = passwordConfirm;
    user.passwordResetToken = null;
    user.passwordResetTokenExpires = null;

    // 3) update changedPasswordAt property for the user with pre-save middleware
    await user.save();

    // 4) Log the user in, send jwt
    const message = "Password changed successfully.";
    createSendToken(user, 200, req, res, message);
  },
);
