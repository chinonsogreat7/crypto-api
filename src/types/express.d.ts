import type { PublicUser, User } from "../models";

declare global {
  namespace Express {
    interface Request {
      user: User;
      publicUser: PublicUser;
    }
  }
}

export {};
