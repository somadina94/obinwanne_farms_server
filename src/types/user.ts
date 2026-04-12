import type { Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  role: "user" | "admin";
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  password: string;
  passwordConfirm?: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string | null;
  passwordResetTokenExpires?: Date | null;
  createdAt?: Date;

  // Methods
  correctPassword(
    candidatePassword: string,
    userPassword: string,
  ): Promise<boolean>;
  createPasswordResetToken(): string;
  changedPasswordAfterJWT(JWTTimestamp: number | undefined): boolean;
}
