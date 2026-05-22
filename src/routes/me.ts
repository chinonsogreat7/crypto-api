import express, { type Request } from "express";
import { clone, createId, db, publicUser } from "../data/store";
import { requireAuth } from "../middleware/auth";
import { isExpoPushToken, registerDeviceToken } from "../services/notifications";
import { evaluatePriceAlerts } from "../services/price-alerts";
import { SUPPORTED_FIAT_CURRENCIES, type AssetSymbol, type DeviceToken, type PriceAlert, type PublicUser, type UserSettings } from "../models";
import { badRequest, created, notFound, ok } from "../utils/http";
import {
  isAssetSymbol,
  isBoolean,
  isEnumValue,
  isHttpUrlOrStoragePath,
  isNonEmptyString,
  isPhoneNumber,
  isPin,
  isPositiveNumber,
  normalizePhone
} from "../utils/validation";

export const meRouter = express.Router();

meRouter.use(requireAuth);

type ProfileBody = Partial<Pick<PublicUser, "fullName" | "phone" | "avatarUrl">>;
type SettingsBody = Partial<UserSettings>;
type DeviceBody = Pick<DeviceToken, "expoPushToken" | "platform">;
type PriceAlertBody = Partial<Pick<PriceAlert, "assetSymbol" | "direction" | "targetPriceUsd" | "isActive">>;

meRouter.get("/", (req, res) => {
  return ok(res, req.publicUser);
});

meRouter.patch("/", (req: Request<unknown, unknown, ProfileBody>, res) => {
  if (req.body.fullName !== undefined) {
    if (!isNonEmptyString(req.body.fullName, 2, 80)) {
      return badRequest(res, "fullName must be between 2 and 80 characters.", "INVALID_FULL_NAME");
    }
    req.user.fullName = req.body.fullName.trim();
  }

  if (req.body.phone !== undefined) {
    if (!isPhoneNumber(req.body.phone)) {
      return badRequest(res, "phone must be a valid international phone number, for example +2348010000001.", "INVALID_PHONE");
    }

    const normalizedPhone = normalizePhone(req.body.phone);
    const phoneOwner = db.users.find((user) => user.phone === normalizedPhone && user.id !== req.user.id);
    if (phoneOwner) {
      return badRequest(res, "A user with this phone number already exists.", "PHONE_EXISTS");
    }

    req.user.phone = normalizedPhone;
  }

  if (req.body.avatarUrl !== undefined) {
    if (req.body.avatarUrl !== null && !isHttpUrlOrStoragePath(req.body.avatarUrl)) {
      return badRequest(res, "avatarUrl must be a valid http(s) URL or storage path.", "INVALID_AVATAR_URL");
    }
    req.user.avatarUrl = req.body.avatarUrl;
  }

  return ok(res, publicUser(req.user));
});

meRouter.get("/settings", (req, res) => {
  return ok(res, clone(req.user.settings));
});

meRouter.patch("/settings", (req: Request<unknown, unknown, SettingsBody>, res) => {
  const nextSettings = { ...req.user.settings };

  if (req.body.theme !== undefined) {
    if (!isEnumValue(req.body.theme, ["system", "light", "dark"] as const)) {
      return badRequest(res, "theme must be system, light, or dark.", "INVALID_THEME");
    }
    nextSettings.theme = req.body.theme;
  }

  if (req.body.pushNotifications !== undefined) {
    if (!isBoolean(req.body.pushNotifications)) return badRequest(res, "pushNotifications must be true or false.", "INVALID_PUSH_SETTING");
    nextSettings.pushNotifications = req.body.pushNotifications;
  }

  if (req.body.biometricEnabled !== undefined) {
    if (!isBoolean(req.body.biometricEnabled)) return badRequest(res, "biometricEnabled must be true or false.", "INVALID_BIOMETRIC_SETTING");
    nextSettings.biometricEnabled = req.body.biometricEnabled;
  }

  if (req.body.fiatCurrency !== undefined) {
    if (!isEnumValue(req.body.fiatCurrency, SUPPORTED_FIAT_CURRENCIES)) {
      return badRequest(res, `fiatCurrency must be one of ${SUPPORTED_FIAT_CURRENCIES.join(", ")}.`, "INVALID_FIAT_CURRENCY");
    }
    nextSettings.fiatCurrency = req.body.fiatCurrency;
  }

  req.user.settings = nextSettings;
  return ok(res, clone(req.user.settings));
});

meRouter.patch("/pin", (req: Request<unknown, unknown, { currentPin?: string; newPin?: string }>, res) => {
  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin) {
    return badRequest(res, "currentPin and newPin are required.");
  }

  if (currentPin !== req.user.pin) {
    return badRequest(res, "Current PIN is incorrect.", "INVALID_PIN");
  }

  if (!isPin(newPin)) {
    return badRequest(res, "newPin must be 4 to 6 digits.", "INVALID_NEW_PIN");
  }

  req.user.pin = newPin;
  return ok(res, { updated: true });
});

meRouter.post("/devices", (req: Request<unknown, unknown, Partial<DeviceBody>>, res) => {
  const { expoPushToken, platform } = req.body;

  if (!expoPushToken || !isExpoPushToken(expoPushToken)) {
    return badRequest(res, "expoPushToken must be a valid Expo push token.", "INVALID_EXPO_PUSH_TOKEN");
  }

  if (!platform || !isEnumValue(platform, ["ios", "android", "web"] as const)) {
    return badRequest(res, "platform must be ios, android, or web.");
  }

  const device = registerDeviceToken({
    userId: req.user.id,
    expoPushToken,
    platform
  });

  return ok(res, clone(device));
});

meRouter.get("/watchlist", (req, res) => {
  const assets = db.assets.filter((asset) => req.user.watchlist.includes(asset.symbol));
  return ok(res, clone(assets), { count: assets.length });
});

meRouter.post("/watchlist/:symbol", (req: Request<{ symbol: AssetSymbol }>, res) => {
  if (!isAssetSymbol(req.params.symbol)) {
    return badRequest(res, "symbol must be a valid asset symbol.", "INVALID_ASSET_SYMBOL");
  }

  const asset = db.assets.find((item) => item.symbol === req.params.symbol);
  if (!asset) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  if (!req.user.watchlist.includes(asset.symbol)) {
    req.user.watchlist.push(asset.symbol);
  }

  return ok(res, clone(req.user.watchlist));
});

meRouter.delete("/watchlist/:symbol", (req: Request<{ symbol: AssetSymbol }>, res) => {
  if (!isAssetSymbol(req.params.symbol)) {
    return badRequest(res, "symbol must be a valid asset symbol.", "INVALID_ASSET_SYMBOL");
  }

  req.user.watchlist = req.user.watchlist.filter((symbol) => symbol !== req.params.symbol);
  return ok(res, clone(req.user.watchlist));
});

meRouter.get("/price-alerts", (req, res) => {
  const alerts = db.priceAlerts
    .filter((alert) => alert.userId === req.user.id)
    .map((alert) => ({
      ...alert,
      asset: db.assets.find((asset) => asset.symbol === alert.assetSymbol) || null
    }));

  return ok(res, clone(alerts), {
    count: alerts.length,
    active: alerts.filter((alert) => alert.isActive).length
  });
});

meRouter.post("/price-alerts", async (req: Request<unknown, unknown, PriceAlertBody>, res) => {
  const { assetSymbol, direction } = req.body;
  const targetPriceUsd = req.body.targetPriceUsd;
  if (!isAssetSymbol(assetSymbol) || !isEnumValue(direction, ["above", "below"] as const) || !isPositiveNumber(targetPriceUsd, 10_000_000)) {
    return badRequest(res, "assetSymbol, direction, and targetPriceUsd are required.");
  }

  if (!db.assets.some((asset) => asset.symbol === assetSymbol && asset.isActive)) {
    return notFound(res, "Asset was not found.", "ASSET_NOT_FOUND");
  }

  const alert: PriceAlert = {
    id: createId("alert"),
    userId: req.user.id,
    assetSymbol,
    direction,
    targetPriceUsd,
    isActive: true,
    triggeredAt: null,
    createdAt: new Date().toISOString()
  };
  db.priceAlerts.unshift(alert);
  await evaluatePriceAlerts();

  return created(res, clone(alert));
});

meRouter.patch("/price-alerts/:alertId", async (req: Request<{ alertId: string }, unknown, PriceAlertBody>, res) => {
  const alert = db.priceAlerts.find((item) => item.id === req.params.alertId && item.userId === req.user.id);
  if (!alert) {
    return notFound(res, "Price alert was not found.", "PRICE_ALERT_NOT_FOUND");
  }

  if (req.body.direction !== undefined) {
    if (!isEnumValue(req.body.direction, ["above", "below"] as const)) {
      return badRequest(res, "direction must be above or below.");
    }
    alert.direction = req.body.direction;
  }

  if (req.body.targetPriceUsd !== undefined) {
    const targetPriceUsd = req.body.targetPriceUsd;
    if (!isPositiveNumber(targetPriceUsd, 10_000_000)) {
      return badRequest(res, "targetPriceUsd must be greater than zero.");
    }
    alert.targetPriceUsd = targetPriceUsd;
    alert.triggeredAt = null;
  }

  if (req.body.isActive !== undefined) {
    if (!isBoolean(req.body.isActive)) {
      return badRequest(res, "isActive must be true or false.", "INVALID_ACTIVE_STATE");
    }
    alert.isActive = req.body.isActive;
    if (alert.isActive) alert.triggeredAt = null;
  }

  await evaluatePriceAlerts();
  return ok(res, clone(alert));
});

meRouter.delete("/price-alerts/:alertId", (req: Request<{ alertId: string }>, res) => {
  const before = db.priceAlerts.length;
  db.priceAlerts = db.priceAlerts.filter((item) => !(item.id === req.params.alertId && item.userId === req.user.id));
  if (db.priceAlerts.length === before) {
    return notFound(res, "Price alert was not found.", "PRICE_ALERT_NOT_FOUND");
  }

  return ok(res, { deleted: true });
});

meRouter.get("/notifications", (req, res) => {
  const notifications = db.notifications.filter((notification) => notification.userId === req.user.id);
  return ok(res, clone(notifications), {
    count: notifications.length,
    unread: notifications.filter((notification) => !notification.isRead).length
  });
});

meRouter.patch("/notifications/:notificationId/read", (req, res) => {
  const notification = db.notifications.find((item) => item.id === req.params.notificationId && item.userId === req.user.id);
  if (!notification) {
    return notFound(res, "Notification was not found.", "NOTIFICATION_NOT_FOUND");
  }

  notification.isRead = true;
  return ok(res, clone(notification));
});

meRouter.patch("/notifications/read-all", (req, res) => {
  db.notifications.forEach((notification) => {
    if (notification.userId === req.user.id) notification.isRead = true;
  });

  return ok(res, { updated: true });
});
