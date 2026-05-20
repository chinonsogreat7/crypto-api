import { createApp } from "../src/app";
import { bootstrapDatabase } from "../src/data/persistence";
import { generateTotpCode } from "../src/services/totp";

const port = 4300;
const host = "127.0.0.1";
const baseUrl = `http://${host}:${port}`;
const userHeaders = { authorization: "Bearer demo-user-token" };
const adminHeaders = { authorization: "Bearer demo-admin-token" };

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function requestText(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${body}`);
  }
  return body;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expectBadRequest(path: string, options: RequestInit, label: string) {
  await expectStatus(path, options, 400, label);
}

async function expectStatus(path: string, options: RequestInit, status: number, label: string) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (response.status !== status) {
    const body = await response.text();
    throw new Error(`${label} expected ${status} but got ${response.status}: ${body}`);
  }
}

async function main() {
  await bootstrapDatabase();
  const server = createApp().listen(port, host);

  try {
    await request("/health");
    await expectBadRequest("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Bad Phone Student",
        email: `bad-phone-${Date.now()}@cryptoclass.test`,
        phone: "string",
        password: "password123"
      })
    }, "invalid registration phone");
    const newUserBody = await request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Session Student",
        email: `session-${Date.now()}@cryptoclass.test`,
        phone: `+23480${Math.floor(10000000 + Math.random() * 89999999)}`,
        password: "password123"
      })
    });
    if (!newUserBody.data.accessToken || !newUserBody.data.refreshToken) {
      throw new Error("registration did not return accessToken and refreshToken");
    }
    const refreshBody = await request("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: newUserBody.data.refreshToken })
    });
    await expectStatus("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: newUserBody.data.refreshToken })
    }, 401, "reusing rotated refresh token");
    const sessionHeaders = { authorization: `Bearer ${refreshBody.data.accessToken}` };
    await request("/auth/session", { headers: sessionHeaders });
    await request("/auth/logout", { method: "POST", headers: sessionHeaders });

    await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginType: "phone", identifier: "+2348010000001", password: "password123" })
    });

    const setupBody = await request("/auth/2fa/setup", {
      method: "POST",
      headers: userHeaders
    });
    const twoFactorCode = generateTotpCode(setupBody.data.secret);

    await request("/auth/2fa/enable", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ code: twoFactorCode })
    });

    const challengeBody = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginType: "email", identifier: "student@cryptoclass.test", password: "password123" })
    });

    await request("/auth/2fa/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: challengeBody.data.challengeId, code: generateTotpCode(setupBody.data.secret) })
    });

    await request("/auth/2fa/disable", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ password: "password123", code: generateTotpCode(setupBody.data.secret) })
    });

    await request("/market/assets");
    await requestText("/assets/btc.svg");
    await request("/market/assets?page=1&limit=5&search=bit&sort=priceUsd&order=desc");
    await request("/market/prices");
    await request("/market/trending");
    await request("/me", { headers: userHeaders });
    await expectBadRequest("/me", {
      method: "PATCH",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ phone: "string" })
    }, "invalid profile phone");
    await request("/me/settings", { headers: userHeaders });
    await expectBadRequest("/me/settings", {
      method: "PATCH",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ pushNotifications: "yes" })
    }, "invalid settings boolean");
    await request("/me/devices", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        expoPushToken: "ExponentPushToken[demoPushToken123]",
        platform: "ios"
      })
    });
    await expectBadRequest("/me/devices", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ expoPushToken: "not-a-token", platform: "ios" })
    }, "invalid push token");
    await request("/me/watchlist", { headers: userHeaders });
    await expectBadRequest("/me/watchlist/not-a-symbol", {
      method: "POST",
      headers: userHeaders
    }, "invalid watchlist symbol");
    await expectBadRequest("/me/price-alerts", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ assetSymbol: "BTC", direction: "sideways", targetPriceUsd: "72000" })
    }, "invalid price alert");
    const alertBody = await request("/me/price-alerts", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ assetSymbol: "BTC", direction: "above", targetPriceUsd: 1 })
    });
    await request("/me/price-alerts", { headers: userHeaders });
    await request(`/me/price-alerts/${alertBody.data.id}`, {
      method: "PATCH",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ targetPriceUsd: 73000, isActive: false })
    });
    await request(`/me/price-alerts/${alertBody.data.id}`, {
      method: "DELETE",
      headers: userHeaders
    });
    await request("/me/notifications", { headers: userHeaders });
    await request("/wallet", { headers: userHeaders });
    await request("/wallet/portfolio/history?range=1M", { headers: userHeaders });
    await request("/wallet/deposit-addresses/USDC", { headers: userHeaders });
    const uploadBody = await request("/auth/kyc/uploads", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "student-national-id.png",
        contentType: "image/png",
        documentKind: "document_front"
      })
    });
    if (uploadBody.data.provider === "demo_local_storage") {
      await request(uploadBody.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "demo image bytes"
      });
      await request(uploadBody.data.publicUrl);
    } else {
      if (uploadBody.data.provider !== "cloudinary" || !String(uploadBody.data.folder).includes("/usr_student/document_front")) {
        throw new Error(`Unexpected Cloudinary upload instructions: ${JSON.stringify(uploadBody.data)}`);
      }
    }
    await requestText("/admin-ui/");
    await request("/admin/dashboard", { headers: adminHeaders });
    await request("/admin/fees", { headers: adminHeaders });
    await expectBadRequest("/admin/fees", {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ buyFeePercent: "1" })
    }, "invalid fee type");
    await expectBadRequest("/admin/assets", {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ symbol: "bad symbol", name: "", network: "Ethereum", priceUsd: "100" })
    }, "invalid admin asset");

    await request("/admin/assets/BTC", {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false })
    });

    await request("/admin/assets/BTC", {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ isActive: true })
    });

    await request("/admin/kyc/kyc_student", {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ status: "approved", reviewerNote: "Approved for classroom demo." })
    });

    await expectBadRequest("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ amount: "500" })
    }, "invalid deposit amount");
    await expectBadRequest("/wallet/withdrawals", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ assetSymbol: "ETH", amount: "0.05", address: "bad", network: "Ethereum Sepolia" })
    }, "invalid withdrawal");

    const depositBody = await request("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ amount: 500, settlementDelaySeconds: 1 })
    });
    await request(depositBody.data.pollingUrl, { headers: userHeaders });
    await wait(1200);
    await request(depositBody.data.pollingUrl, { headers: userHeaders });

    await expectBadRequest("/trade/quotes", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "buy", fromAsset: "USD", toAsset: "USDC", fromAmount: "50" })
    }, "invalid quote amount");
    const quoteBody = await request("/trade/quotes", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "buy", fromAsset: "USD", toAsset: "USDC", fromAmount: 50 })
    });
    await request(`/trade/quotes/${quoteBody.data.id}`, { headers: userHeaders });

    await request("/trade/execute", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ quoteId: quoteBody.data.id, pin: "1234" })
    });

    await request("/wallet/transactions?page=1&limit=10&type=buy&status=completed", { headers: userHeaders });
    console.log("Smoke test passed.");
  } finally {
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
