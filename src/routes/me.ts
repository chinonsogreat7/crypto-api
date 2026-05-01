import express, { type Request } from "express";
import { clone, db, publicUser } from "../data/store";
import { requireAuth } from "../middleware/auth";
import type { AssetSymbol, PublicUser, UserSettings } from "../models";
import { badRequest, notFound, ok } from "../utils/http";

export const meRouter = express.Router();

meRouter.use(requireAuth);

type ProfileBody = Partial<Pick<PublicUser, "fullName" | "phone" | "avatarUrl">>;
type SettingsBody = Partial<UserSettings>;

meRouter.get("/", (req, res) => {
  return ok(res, req.publicUser);
});

meRouter.patch("/", (req: Request<unknown, unknown, ProfileBody>, res) => {
  if (req.body.fullName !== undefined) req.user.fullName = req.body.fullName;
  if (req.body.phone !== undefined) req.user.phone = req.body.phone;
  if (req.body.avatarUrl !== undefined) req.user.avatarUrl = req.body.avatarUrl;

  return ok(res, publicUser(req.user));
});

meRouter.get("/settings", (req, res) => {
  return ok(res, clone(req.user.settings));
});

meRouter.patch("/settings", (req: Request<unknown, unknown, SettingsBody>, res) => {
  const nextSettings = { ...req.user.settings };

  if (req.body.theme !== undefined) nextSettings.theme = req.body.theme;
  if (req.body.priceAlerts !== undefined) nextSettings.priceAlerts = req.body.priceAlerts;
  if (req.body.pushNotifications !== undefined) nextSettings.pushNotifications = req.body.pushNotifications;
  if (req.body.biometricEnabled !== undefined) nextSettings.biometricEnabled = req.body.biometricEnabled;
  if (req.body.fiatCurrency !== undefined) nextSettings.fiatCurrency = req.body.fiatCurrency;

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

  if (!/^[0-9]{4,6}$/.test(newPin)) {
    return badRequest(res, "newPin must be 4 to 6 digits.", "INVALID_NEW_PIN");
  }

  req.user.pin = newPin;
  return ok(res, { updated: true });
});

meRouter.get("/watchlist", (req, res) => {
  const assets = db.assets.filter((asset) => req.user.watchlist.includes(asset.symbol));
  return ok(res, clone(assets), { count: assets.length });
});

meRouter.post("/watchlist/:symbol", (req: Request<{ symbol: AssetSymbol }>, res) => {
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
  req.user.watchlist = req.user.watchlist.filter((symbol) => symbol !== req.params.symbol);
  return ok(res, clone(req.user.watchlist));
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
