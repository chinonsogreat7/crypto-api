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

async function main() {
  await bootstrapDatabase();
  const server = createApp().listen(port, host);

  try {
    await request("/health");
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
    await request("/market/assets?page=1&limit=5&search=bit&sort=priceUsd&order=desc");
    await request("/market/prices");
    await request("/market/trending");
    await request("/me", { headers: userHeaders });
    await request("/me/settings", { headers: userHeaders });
    await request("/me/devices", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        expoPushToken: "ExponentPushToken[demoPushToken123]",
        platform: "ios"
      })
    });
    await request("/me/watchlist", { headers: userHeaders });
    const alertBody = await request("/me/price-alerts", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ assetSymbol: "BTC", direction: "above", targetPriceUsd: 72000 })
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
    await request(uploadBody.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: "demo image bytes"
    });
    await request(uploadBody.data.publicUrl);
    await requestText("/admin-ui/");
    await request("/admin/dashboard", { headers: adminHeaders });
    await request("/admin/fees", { headers: adminHeaders });

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

    await request("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ amount: 500 })
    });

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
