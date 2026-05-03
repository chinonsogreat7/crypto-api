import { createId, db } from "../data/store";
import type { DeviceToken, Notification } from "../models";

interface NotificationInput {
  userId: string;
  title: string;
  body: string;
  type: Notification["type"];
  data?: Record<string, unknown>;
}

interface RegisterDeviceInput {
  userId: string;
  expoPushToken: string;
  platform: DeviceToken["platform"];
}

function pushEnabled(): boolean {
  return process.env.ENABLE_PUSH_NOTIFICATIONS === "true";
}

export function isExpoPushToken(value: string): boolean {
  return /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(value) || /^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

export function registerDeviceToken(input: RegisterDeviceInput): DeviceToken {
  const now = new Date().toISOString();
  const existing = db.deviceTokens.find((item) => item.expoPushToken === input.expoPushToken);

  if (existing) {
    existing.userId = input.userId;
    existing.platform = input.platform;
    existing.lastSeenAt = now;
    return existing;
  }

  const deviceToken: DeviceToken = {
    id: createId("device"),
    userId: input.userId,
    expoPushToken: input.expoPushToken,
    platform: input.platform,
    createdAt: now,
    lastSeenAt: now
  };

  db.deviceTokens.unshift(deviceToken);
  return deviceToken;
}

export async function notifyUser(input: NotificationInput): Promise<Notification> {
  const notification: Notification = {
    id: createId("ntf"),
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    isRead: false,
    createdAt: new Date().toISOString()
  };

  db.notifications.unshift(notification);
  await sendExpoPush(input).catch((error) => {
    console.error("Failed to send Expo push notification", error);
  });

  return notification;
}

async function sendExpoPush(input: NotificationInput): Promise<void> {
  if (!pushEnabled()) return;

  const user = db.users.find((item) => item.id === input.userId);
  if (!user?.settings.pushNotifications) return;

  const tokens = db.deviceTokens.filter((item) => item.userId === input.userId).map((item) => item.expoPushToken);
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: input.title,
    body: input.body,
    data: input.data || {}
  }));

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(messages)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Expo push failed: ${response.status} ${body}`);
  }
}
