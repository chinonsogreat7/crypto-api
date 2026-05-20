import { saveCurrentDatabase } from "../data/persistence";
import { db } from "../data/store";
import { notifyUser } from "./notifications";

interface EvaluateOptions {
  persist?: boolean;
}

function hasCrossed(direction: "above" | "below", currentPrice: number, targetPrice: number): boolean {
  return direction === "above" ? currentPrice >= targetPrice : currentPrice <= targetPrice;
}

export async function evaluatePriceAlerts(options: EvaluateOptions = {}): Promise<number> {
  let triggeredCount = 0;
  const now = new Date().toISOString();

  for (const alert of db.priceAlerts) {
    if (!alert.isActive || alert.triggeredAt) continue;

    const asset = db.assets.find((item) => item.symbol === alert.assetSymbol && item.isActive);
    if (!asset || !hasCrossed(alert.direction, asset.priceUsd, alert.targetPriceUsd)) continue;

    alert.isActive = false;
    alert.triggeredAt = now;
    triggeredCount += 1;

    await notifyUser({
      userId: alert.userId,
      title: `${alert.assetSymbol} price alert`,
      body: `${alert.assetSymbol} is now ${alert.direction} $${alert.targetPriceUsd.toLocaleString()}. Current price is $${asset.priceUsd.toLocaleString()}.`,
      type: "price_alert",
      data: {
        alertId: alert.id,
        assetSymbol: alert.assetSymbol,
        direction: alert.direction,
        targetPriceUsd: alert.targetPriceUsd,
        currentPriceUsd: asset.priceUsd
      }
    });
  }

  if (triggeredCount > 0 && options.persist) {
    await saveCurrentDatabase();
  }

  return triggeredCount;
}
