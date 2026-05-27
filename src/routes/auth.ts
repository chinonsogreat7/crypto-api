import express, { type Request } from "express";
import { clone, createId, db, publicUser } from "../data/store";
import { requireAuth } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { rateLimit } from "../middleware/rate-limit";
import { createRecoveryCodes, recoveryCodeCount, verifyAndConsumeRecoveryCode } from "../services/recovery-codes";
import { createKycUpload, type KycUploadRequest } from "../services/storage";
import { createSession, findSessionByRefreshToken, rotateSession, tokenMetadata } from "../services/tokens";
import { generateTotpSecret, otpauthUri, verifyTotpCode } from "../services/totp";
import type { KycSubmission, Session, User } from "../models";
import { badRequest, created, ok } from "../utils/http";
import {
  isEnumValue,
  isEmail,
  isHttpUrlOrStoragePath,
  isNonEmptyString,
  isPhoneNumber,
  isStrongEnoughPassword,
  normalizeEmail,
  normalizePhone
} from "../utils/validation";

export const authRouter = express.Router();
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const authLimiter = rateLimit({ keyPrefix: "auth", windowMs: 60 * 1000, maxRequests: 20 });
const otpLimiter = rateLimit({ keyPrefix: "otp", windowMs: 60 * 1000, maxRequests: 5 });
const kycLimiter = rateLimit({ keyPrefix: "kyc", windowMs: 60 * 1000, maxRequests: 10 });

interface LoginBody {
  loginType?: "email" | "phone";
  identifier?: string;
  email?: string;
  password?: string;
}

interface TwoFactorVerifyBody {
  challengeId?: string;
  code?: string;
  recoveryCode?: string;
}

interface RefreshBody {
  refreshToken?: string;
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

function authResponse(user: User, session: Session) {
  return {
    user: publicUser(user),
    accessToken: session.token,
    token: session.token,
    refreshToken: session.refreshToken,
    ...tokenMetadata(session)
  };
}

function createTwoFactorChallenge(user: User) {
  const now = Date.now();
  db.twoFactorChallenges = db.twoFactorChallenges.filter((item) => new Date(item.expiresAt).getTime() > now);

  const challenge = {
    id: createId("2fa"),
    userId: user.id,
    attemptsRemaining: TWO_FACTOR_MAX_ATTEMPTS,
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString()
  };
  db.twoFactorChallenges.push(challenge);
  return challenge;
}

function failTwoFactorChallenge(challengeId: string) {
  const challenge = db.twoFactorChallenges.find((item) => item.id === challengeId);
  if (!challenge) return null;

  challenge.attemptsRemaining -= 1;
  if (challenge.attemptsRemaining <= 0) {
    db.twoFactorChallenges = db.twoFactorChallenges.filter((item) => item.id !== challengeId);
  }

  return challenge;
}

authRouter.get("/session", requireAuth, (req, res) => {
  const session = db.sessions.find((item) => item.token === req.authToken);
  if (!session) {
    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "The token is invalid."
      }
    });
  }

  return ok(res, {
    authenticated: true,
    ...authResponse(req.user, session)
  });
});

authRouter.post("/logout", requireAuth, (req, res) => {
  db.sessions = db.sessions.filter((session) => session.token !== req.authToken);
  return ok(res, { loggedOut: true });
});

authRouter.post("/refresh", authLimiter, (req: Request<unknown, unknown, RefreshBody>, res) => {
  if (!isNonEmptyString(req.body.refreshToken, 20, 200)) {
    return badRequest(res, "refreshToken is required.", "INVALID_REFRESH_TOKEN");
  }

  const session = findSessionByRefreshToken(req.body.refreshToken);
  if (!session) {
    return res.status(401).json({
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "The refresh token is invalid."
      }
    });
  }

  if (new Date(session.refreshTokenExpiresAt).getTime() < Date.now()) {
    db.sessions = db.sessions.filter((item) => item.refreshToken !== req.body.refreshToken);
    return res.status(401).json({
      error: {
        code: "REFRESH_TOKEN_EXPIRED",
        message: "The refresh token has expired. Sign in again."
      }
    });
  }

  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    db.sessions = db.sessions.filter((item) => item.refreshToken !== req.body.refreshToken);
    return res.status(401).json({
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "The refresh token is no longer attached to a user."
      }
    });
  }

  const nextSession = rotateSession(session);
  return ok(res, authResponse(user, nextSession));
});

authRouter.post("/register", authLimiter, (req: Request<unknown, unknown, RegisterBody>, res) => {
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
    twoFactorRecoveryCodes: [],
    kycStatus: "not_started",
    avatarUrl: null,
    watchlist: ["BTC", "ETH"],
    settings: {
      language: "en",
      fiatCurrency: "USD",
      theme: "system",
      pushNotifications: true,
      biometricEnabled: false
    },
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  const session = createSession(user);
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

  return created(res, authResponse(user, session));
});

authRouter.post("/login", authLimiter, (req: Request<unknown, unknown, LoginBody>, res) => {
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
      attemptsRemaining: challenge.attemptsRemaining,
      expiresAt: challenge.expiresAt
    });
  }

  const session = createSession(user);
  return ok(res, authResponse(user, session));
});

authRouter.post("/2fa/setup", requireAuth, (req, res) => {
  const secret = generateTotpSecret();
  req.user.twoFactorSecret = secret;
  req.user.twoFactorEnabled = false;
  req.user.twoFactorRecoveryCodes = [];

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
  const recoveryCodes = createRecoveryCodes();
  req.user.twoFactorRecoveryCodes = recoveryCodes.hashes;

  return ok(res, {
    enabled: true,
    recoveryCodes: recoveryCodes.codes,
    recoveryCodeCount: recoveryCodes.codes.length
  });
});

authRouter.post("/2fa/verify", authLimiter, (req: Request<unknown, unknown, TwoFactorVerifyBody>, res) => {
  const { challengeId, code, recoveryCode } = req.body;
  if (!challengeId || (!code && !recoveryCode)) {
    return badRequest(res, "challengeId and either code or recoveryCode are required.");
  }

  if (code && recoveryCode) {
    return badRequest(res, "Send either code or recoveryCode, not both.", "INVALID_TWO_FACTOR_METHOD");
  }

  const challenge = db.twoFactorChallenges.find((item) => item.id === challengeId);
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    return badRequest(res, "2FA challenge was not found or has expired.", "TWO_FACTOR_CHALLENGE_EXPIRED");
  }

  const user = db.users.find((item) => item.id === challenge.userId);
  const verifiedByCode = Boolean(code && user?.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, code));
  const verifiedByRecoveryCode = Boolean(recoveryCode && user && verifyAndConsumeRecoveryCode(user, recoveryCode));

  if (!user || (!verifiedByCode && !verifiedByRecoveryCode)) {
    const updatedChallenge = failTwoFactorChallenge(challenge.id);
    if (!updatedChallenge || updatedChallenge.attemptsRemaining <= 0) {
      return res.status(429).json({
        error: {
          code: "TWO_FACTOR_ATTEMPTS_EXHAUSTED",
          message: "Too many invalid 2FA attempts. Start login again."
        }
      });
    }

    return res.status(400).json({
      error: {
        code: "INVALID_TWO_FACTOR_CODE",
        message: "Invalid authenticator code or recovery code.",
        attemptsRemaining: updatedChallenge.attemptsRemaining
      }
    });
  }

  db.twoFactorChallenges = db.twoFactorChallenges.filter((item) => item.id !== challenge.id);
  const session = createSession(user);
  return ok(res, authResponse(user, session));
});

authRouter.post("/2fa/recovery-codes/regenerate", requireAuth, (req: Request<unknown, unknown, { password?: string; code?: string }>, res) => {
  if (!req.user.twoFactorEnabled || !req.user.twoFactorSecret) {
    return badRequest(res, "2FA must be enabled before regenerating recovery codes.", "TWO_FACTOR_NOT_ENABLED");
  }

  if (!req.body.password || req.body.password !== req.user.password) {
    return badRequest(res, "password is required and must match the current user.", "INVALID_PASSWORD");
  }

  if (!req.body.code || !verifyTotpCode(req.user.twoFactorSecret, req.body.code)) {
    return badRequest(res, "Invalid authenticator code.", "INVALID_TWO_FACTOR_CODE");
  }

  const recoveryCodes = createRecoveryCodes();
  req.user.twoFactorRecoveryCodes = recoveryCodes.hashes;
  return ok(res, {
    recoveryCodes: recoveryCodes.codes,
    recoveryCodeCount: recoveryCodes.codes.length
  });
});

authRouter.post("/2fa/disable", requireAuth, (req: Request<unknown, unknown, { password?: string; code?: string; recoveryCode?: string }>, res) => {
  if (!req.body.password || req.body.password !== req.user.password) {
    return badRequest(res, "password is required and must match the current user.", "INVALID_PASSWORD");
  }

  if (req.user.twoFactorSecret) {
    const verifiedByCode = Boolean(req.body.code && verifyTotpCode(req.user.twoFactorSecret, req.body.code));
    const verifiedByRecoveryCode = Boolean(req.body.recoveryCode && verifyAndConsumeRecoveryCode(req.user, req.body.recoveryCode));

    if (!verifiedByCode && !verifiedByRecoveryCode) {
      return badRequest(res, "Invalid authenticator code or recovery code.", "INVALID_TWO_FACTOR_CODE");
    }
  }

  req.user.twoFactorEnabled = false;
  req.user.twoFactorSecret = null;
  req.user.twoFactorRecoveryCodes = [];
  return ok(res, { enabled: false, recoveryCodeCount: recoveryCodeCount(req.user) });
});

authRouter.post("/otp/request", otpLimiter, (req: Request<unknown, unknown, { email?: string }>, res) => {
  if (!req.body.email || !isEmail(req.body.email)) {
    return badRequest(res, "email must be a valid email address.", "INVALID_EMAIL");
  }

  return ok(res, {
    message: "Demo OTP sent.",
    demoCode: "123456",
    expiresInSeconds: 300
  });
});

authRouter.post("/otp/verify", otpLimiter, (req: Request<unknown, unknown, VerifyOtpBody>, res) => {
  if (!req.body.email || !isEmail(req.body.email) || !req.body.code) {
    return badRequest(res, "a valid email and code are required.");
  }

  if (req.body.code !== "123456") {
    return badRequest(res, "Invalid OTP code.", "INVALID_OTP");
  }

  return ok(res, { verified: true });
});

authRouter.post("/kyc/uploads", requireAuth, kycLimiter, (req: Request<unknown, unknown, KycUploadRequest>, res) => {
  const upload = createKycUpload(req.user.id, req.body);
  if (!upload) {
    return badRequest(res, "fileName and contentType are required.");
  }

  return created(res, upload);
});

authRouter.post("/kyc", requireAuth, kycLimiter, idempotency("kyc.submit"), (req: Request<unknown, unknown, KycBody>, res) => {
  const { legalName, country, documentType, documentNumber, selfieImageUrl, documentImageUrl } = req.body;

  if (!legalName || !country || !documentType || !documentNumber) {
    return badRequest(res, "legalName, country, documentType, and documentNumber are required.");
  }

  if (!isNonEmptyString(legalName, 2, 120) || !isNonEmptyString(country, 2, 80) || !isNonEmptyString(documentNumber, 3, 80)) {
    return badRequest(res, "legalName, country, and documentNumber must be valid text values.", "INVALID_KYC_DETAILS");
  }

  if (!isEnumValue(documentType, ["national_id", "passport", "drivers_license"] as const)) {
    return badRequest(res, "documentType must be national_id, passport, or drivers_license.", "INVALID_DOCUMENT_TYPE");
  }

  if ((selfieImageUrl && !isHttpUrlOrStoragePath(selfieImageUrl)) || (documentImageUrl && !isHttpUrlOrStoragePath(documentImageUrl))) {
    return badRequest(res, "selfieImageUrl and documentImageUrl must be http(s) URLs or demo /storage/files paths.", "INVALID_KYC_IMAGE_URL");
  }

  const submission: KycSubmission = {
    id: createId("kyc"),
    userId: req.user.id,
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

  req.user.kycStatus = "pending";
  db.kycSubmissions.unshift(submission);
  return created(res, clone(submission));
});
