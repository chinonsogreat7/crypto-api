import type { PublicUser, User } from "../models";

declare global {
  namespace Express {
    interface Request {
      authToken: string;
      user: User;
      publicUser: PublicUser;
    }
  }
}

export {};
