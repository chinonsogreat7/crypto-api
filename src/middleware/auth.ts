import type { NextFunction, Request, Response } from "express";
import { findUserByToken, publicUser } from "../data/store";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message: "Send Authorization: Bearer demo-user-token"
      }
    });
  }

  const user = findUserByToken(token);
  if (!user) {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "The token is invalid."
      }
    });
  }

  req.authToken = token;
  req.user = user;
  req.publicUser = publicUser(user);
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: {
        code: "ADMIN_REQUIRED",
        message: "This route requires an admin token."
      }
    });
  }

  return next();
}
