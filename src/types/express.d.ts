import type { IUser } from "./user.js";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export {};
