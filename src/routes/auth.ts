import express, { type Request } from "express";
import { clone, createId, db, publicUser } from "../data/store";
import { requireAuth } from "../middleware/auth";
import { createKycUpload, type KycUploadRequest } from "../services/storage";
import { generateTotpSecret, otpauthUri, verifyTotpCode } from "../services/totp";
import type { KycSubmission, User } from "../models";
import { badRequest, created, ok } from "../utils/http";
import {
  isEmail,
  isHttpUrlOrStoragePath,
  isNonEmptyString,
  isPhoneNumber,
  isStrongEnoughPassword,
  normalizeEmail,
  normalizePhone
} from "../utils/validation";

export const authRouter = express.Router();

interface LoginBody {
  loginType?: "email" | "phone";
  identifier?: string;
  email?: string;
  password?: string;
}

interface TwoFactorVerifyBody {
  challengeId?: string;
  code?: string;
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

function findUserByLogin(loginType: "email" | "phone", identifier: string): User | undefined {
  const trimmed = identifier.trim();
  if (loginType === "email") {
    const normalized = trimmed.toLowerCase();
    return db.users.find((item) => item.email.toLowerCase() === normalized);
  }

  return db.users.find((item) => item.phone === trimmed);
}

function sessionFor(user: User) {
  let session = db.sessions.find((item) => item.userId === user.id);
  if (!session) {
    session = { token: `demo-token-${user.id}`, userId: user.id };
    db.sessions.push(session);
  }
  return session;
}

function createTwoFactorChallenge(user: User) {
  const now = Date.now();
  db.twoFactorChallenges = db.twoFactorChallenges.filter((item) => new Date(item.expiresAt).getTime() > now);

  const challenge = {
    id: createId("2fa"),
    userId: user.id,
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString()
  };
  db.twoFactorChallenges.push(challenge);
  return challenge;
}

authRouter.get("/session", requireAuth, (req, res) => {
  return ok(res, {
    authenticated: true,
    user: req.publicUser,
    token: req.authToken
  });
});

authRouter.post("/logout", requireAuth, (req, res) => {
  db.sessions = db.sessions.filter((session) => session.token !== req.authToken);
  return ok(res, { loggedOut: true });
});

authRouter.post("/register", (req: Request<unknown, unknown, RegisterBody>, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    return badRequest(res, "fullName, email, phone, and password are required.");
  }

  if (!isNonEmptyString(fullName, 2, 80)) {
    return badRequest(res, "fullName must be between 2 and 80 characters.", "INVALID_FULL_NAME");
  }

  if (!isEmail(email)) {
    return badRequest(res, "email must be a valid email address.", "INVALID_EMAIL");
  }

  if (!isPhoneNumber(phone)) {
    return badRequest(res, "phone must be a valid international phone number, for example +2348010000001.", "INVALID_PHONE");
  }

  if (!isStrongEnoughPassword(password)) {
    return badRequest(res, "password must be at least 8 characters.", "INVALID_PASSWORD");
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (db.users.some((user) => user.email === normalizedEmail)) {
    return badRequest(res, "A user with this email already exists.", "EMAIL_EXISTS");
  }

  if (db.users.some((user) => user.phone === normalizedPhone)) {
    return badRequest(res, "A user with this phone number already exists.", "PHONE_EXISTS");
  }

  const user: User = {
    id: createId("usr"),
    role: "customer",
    fullName: fullName.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    pin: "0000",
    twoFactorEnabled: false,
    twoFactorSecret: null,
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
  const identifier = req.body.identifier || req.body.email;
  const loginType = req.body.loginType || (req.body.email ? "email" : undefined);
  const { password } = req.body;
  if (!loginType || !["email", "phone"].includes(loginType)) {
    return badRequest(res, "loginType must be email or phone.", "INVALID_LOGIN_TYPE");
  }

  if (!identifier || !password) {
    return badRequest(res, "identifier and password are required.");
  }

  if (loginType === "email" && !isEmail(identifier)) {
    return badRequest(res, "identifier must be a valid email address.", "INVALID_EMAIL");
  }

  if (loginType === "phone" && !isPhoneNumber(identifier)) {
    return badRequest(res, "identifier must be a valid international phone number.", "INVALID_PHONE");
  }

  const normalizedIdentifier = loginType === "phone" ? normalizePhone(identifier) : normalizeEmail(identifier);
  const user = findUserByLogin(loginType, normalizedIdentifier);
  if (!user || user.password !== password) {
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Login details or password is incorrect."
      }
    });
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challenge = createTwoFactorChallenge(user);
    return ok(res, {
      requiresTwoFactor: true,
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt
    });
  }

  const session = sessionFor(user);
  return ok(res, { user: publicUser(user), token: session.token });
});

authRouter.post("/2fa/setup", requireAuth, (req, res) => {
  const secret = generateTotpSecret();
  req.user.twoFactorSecret = secret;
  req.user.twoFactorEnabled = false;

  return ok(res, {
    secret,
    otpauthUri: otpauthUri(req.user.email, secret),
    enabled: false
  });
});

authRouter.post("/2fa/enable", requireAuth, (req: Request<unknown, unknown, { code?: string }>, res) => {
  if (!req.user.twoFactorSecret) {
    return badRequest(res, "Run /auth/2fa/setup before enabling 2FA.", "TWO_FACTOR_SETUP_REQUIRED");
  }

  if (!req.body.code || !verifyTotpCode(req.user.twoFactorSecret, req.body.code)) {
    return badRequest(res, "Invalid authenticator code.", "INVALID_TWO_FACTOR_CODE");
  }

  req.user.twoFactorEnabled = true;
  return ok(res, { enabled: true });
});

authRouter.post("/2fa/verify", (req: Request<unknown, unknown, TwoFactorVerifyBody>, res) => {
  const { challengeId, code } = req.body;
  if (!challengeId || !code) {
    return badRequest(res, "challengeId and code are required.");
  }

  const challenge = db.twoFactorChallenges.find((item) => item.id === challengeId);
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    return badRequest(res, "2FA challenge was not found or has expired.", "TWO_FACTOR_CHALLENGE_EXPIRED");
  }

  const user = db.users.find((item) => item.id === challenge.userId);
  if (!user?.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, code)) {
    return badRequest(res, "Invalid authenticator code.", "INVALID_TWO_FACTOR_CODE");
  }

  db.twoFactorChallenges = db.twoFactorChallenges.filter((item) => item.id !== challenge.id);
  const session = sessionFor(user);
  return ok(res, { user: publicUser(user), token: session.token });
});

authRouter.post("/2fa/disable", requireAuth, (req: Request<unknown, unknown, { password?: string; code?: string }>, res) => {
  if (!req.body.password || req.body.password !== req.user.password) {
    return badRequest(res, "password is required and must match the current user.", "INVALID_PASSWORD");
  }

  if (req.user.twoFactorSecret && (!req.body.code || !verifyTotpCode(req.user.twoFactorSecret, req.body.code))) {
    return badRequest(res, "Invalid authenticator code.", "INVALID_TWO_FACTOR_CODE");
  }

  req.user.twoFactorEnabled = false;
  req.user.twoFactorSecret = null;
  return ok(res, { enabled: false });
});

authRouter.post("/otp/request", (req: Request<unknown, unknown, { email?: string }>, res) => {
  if (!req.body.email || !isEmail(req.body.email)) {
    return badRequest(res, "email must be a valid email address.", "INVALID_EMAIL");
  }

  return ok(res, {
    message: "Demo OTP sent.",
    demoCode: "123456",
    expiresInSeconds: 300
  });
});

authRouter.post("/otp/verify", (req: Request<unknown, unknown, VerifyOtpBody>, res) => {
  if (!req.body.email || !isEmail(req.body.email) || !req.body.code) {
    return badRequest(res, "a valid email and code are required.");
  }

  if (req.body.code !== "123456") {
    return badRequest(res, "Invalid OTP code.", "INVALID_OTP");
  }

  return ok(res, { verified: true });
});

authRouter.post("/kyc/uploads", requireAuth, (req: Request<unknown, unknown, KycUploadRequest>, res) => {
  const upload = createKycUpload(req.user.id, req.body);
  if (!upload) {
    return badRequest(res, "fileName and contentType are required.");
  }

  return created(res, upload);
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

  if (!isNonEmptyString(legalName, 2, 120) || !isNonEmptyString(country, 2, 80) || !isNonEmptyString(documentNumber, 3, 80)) {
    return badRequest(res, "legalName, country, and documentNumber must be valid text values.", "INVALID_KYC_DETAILS");
  }

  if (!["national_id", "passport", "drivers_license"].includes(documentType)) {
    return badRequest(res, "documentType must be national_id, passport, or drivers_license.", "INVALID_DOCUMENT_TYPE");
  }

  if ((selfieImageUrl && !isHttpUrlOrStoragePath(selfieImageUrl)) || (documentImageUrl && !isHttpUrlOrStoragePath(documentImageUrl))) {
    return badRequest(res, "selfieImageUrl and documentImageUrl must be http(s) URLs or demo /storage/files paths.", "INVALID_KYC_IMAGE_URL");
  }

  const submission: KycSubmission = {
    id: createId("kyc"),
    userId: user.id,
    legalName: legalName.trim(),
    country: country.trim(),
    documentType,
    documentNumber: documentNumber.trim(),
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
