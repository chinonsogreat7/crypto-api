import express, { type Request } from "express";
import { clone, createId, db, publicUser } from "../data/store";
import type { KycSubmission, User } from "../models";
import { badRequest, created, ok } from "../utils/http";

export const authRouter = express.Router();

interface LoginBody {
  email?: string;
  password?: string;
}

interface RegisterBody {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
}

interface VerifyOtpBody {
  email?: string;
  code?: string;
}

interface KycBody {
  legalName?: string;
  country?: string;
  documentType?: "national_id" | "passport" | "drivers_license";
  documentNumber?: string;
  selfieImageUrl?: string;
  documentImageUrl?: string;
}

authRouter.post("/register", (req: Request<unknown, unknown, RegisterBody>, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    return badRequest(res, "fullName, email, phone, and password are required.");
  }

  const normalizedEmail = email.toLowerCase();
  if (db.users.some((user) => user.email === normalizedEmail)) {
    return badRequest(res, "A user with this email already exists.", "EMAIL_EXISTS");
  }

  const user: User = {
    id: createId("usr"),
    role: "customer",
    fullName,
    email: normalizedEmail,
    phone,
    password,
    pin: "0000",
    kycStatus: "not_started",
    avatarUrl: null,
    watchlist: ["BTC", "ETH"],
    settings: {
      language: "en",
      fiatCurrency: "USD",
      theme: "system",
      priceAlerts: true,
      pushNotifications: true,
      biometricEnabled: false
    },
    createdAt: new Date().toISOString()
  };

  const token = `demo-token-${user.id}`;
  db.users.push(user);
  db.sessions.push({ token, userId: user.id });
  db.wallets.push({
    id: createId("wallet"),
    userId: user.id,
    fiatCurrency: "USD",
    depositAddresses: [
      {
        assetSymbol: "USDC",
        network: "Base Sepolia",
        address: "0x3333333333333333333333333333333333333333",
        qrPayload: "ethereum:0x3333333333333333333333333333333333333333@84532"
      }
    ],
    balances: [{ assetSymbol: "USD", available: 1000, locked: 0 }]
  });

  return created(res, { user: publicUser(user), token });
});

authRouter.post("/login", (req: Request<unknown, unknown, LoginBody>, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return badRequest(res, "email and password are required.");
  }

  const user = db.users.find((item) => item.email === email.toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect."
      }
    });
  }

  let session = db.sessions.find((item) => item.userId === user.id);
  if (!session) {
    session = { token: `demo-token-${user.id}`, userId: user.id };
    db.sessions.push(session);
  }

  return ok(res, { user: publicUser(user), token: session.token });
});

authRouter.post("/otp/request", (req: Request<unknown, unknown, { email?: string }>, res) => {
  if (!req.body.email) {
    return badRequest(res, "email is required.");
  }

  return ok(res, {
    message: "Demo OTP sent.",
    demoCode: "123456",
    expiresInSeconds: 300
  });
});

authRouter.post("/otp/verify", (req: Request<unknown, unknown, VerifyOtpBody>, res) => {
  if (!req.body.email || !req.body.code) {
    return badRequest(res, "email and code are required.");
  }

  if (req.body.code !== "123456") {
    return badRequest(res, "Invalid OTP code.", "INVALID_OTP");
  }

  return ok(res, { verified: true });
});

authRouter.post("/kyc", (req: Request<unknown, unknown, KycBody>, res) => {
  const { legalName, country, documentType, documentNumber, selfieImageUrl, documentImageUrl } = req.body;
  const token = (req.get("authorization") || "").replace("Bearer ", "");
  const session = db.sessions.find((item) => item.token === token);
  const user = session ? db.users.find((item) => item.id === session.userId) : null;

  if (!user) {
    return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Send a user token." } });
  }

  if (!legalName || !country || !documentType || !documentNumber) {
    return badRequest(res, "legalName, country, documentType, and documentNumber are required.");
  }

  if ((selfieImageUrl && !URL.canParse(selfieImageUrl)) || (documentImageUrl && !URL.canParse(documentImageUrl))) {
    return badRequest(res, "selfieImageUrl and documentImageUrl must be valid URLs when provided.", "INVALID_KYC_IMAGE_URL");
  }

  const submission: KycSubmission = {
    id: createId("kyc"),
    userId: user.id,
    legalName,
    country,
    documentType,
    documentNumber,
    selfieImageUrl: selfieImageUrl || null,
    documentImageUrl: documentImageUrl || null,
    status: "pending",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerNote: null
  };

  user.kycStatus = "pending";
  db.kycSubmissions.unshift(submission);
  return created(res, clone(submission));
});
