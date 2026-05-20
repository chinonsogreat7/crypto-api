import type { PublicUser, User } from "../models";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      requestStartedAt: number;
      authToken: string;
      user: User;
      publicUser: PublicUser;
    }
  }
}

export {};
