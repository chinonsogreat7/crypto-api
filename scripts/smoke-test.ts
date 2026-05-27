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

async function requestFirstSseEvent(path: string) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`GET ${path} stream failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!buffer.includes("\n\n")) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
  } finally {
    controller.abort();
    reader.releaseLock();
  }

  const dataLine = buffer.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`GET ${path} did not return an SSE data line`);
  }

  return JSON.parse(dataLine.slice("data: ".length));
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
    const existingSignupValidationBody = await request("/auth/validate-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student@cryptoclass.test",
        phone: "+2348010000001"
      })
    });
    if (existingSignupValidationBody.data.email.code !== "EMAIL_EXISTS" || existingSignupValidationBody.data.phone.code !== "PHONE_EXISTS") {
      throw new Error("signup validation did not detect existing email and phone");
    }
    const availableSignupValidationBody = await request("/auth/validate-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `available-${Date.now()}@cryptoclass.test`,
        phone: `+23481${Math.floor(10000000 + Math.random() * 89999999)}`
      })
    });
    if (!availableSignupValidationBody.data.canRegister || !availableSignupValidationBody.data.email.available || !availableSignupValidationBody.data.phone.available) {
      throw new Error("signup validation did not mark unused email and phone as available");
    }
    const invalidSignupValidationBody = await request("/auth/validate-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bad-email", phone: "string" })
    });
    if (invalidSignupValidationBody.data.canRegister || invalidSignupValidationBody.data.email.code !== "INVALID_EMAIL" || invalidSignupValidationBody.data.phone.code !== "INVALID_PHONE") {
      throw new Error("signup validation did not return field-level invalid states");
    }
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
    const sessionStudentEmail = `session-${Date.now()}@cryptoclass.test`;
    const sessionStudentPhone = `+23480${Math.floor(10000000 + Math.random() * 89999999)}`;
    const newUserBody = await request("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Session Student",
        email: sessionStudentEmail,
        phone: sessionStudentPhone,
        password: "password123"
      })
    });
    if (newUserBody.data.accessToken || newUserBody.data.refreshToken || !newUserBody.data.emailVerificationRequired) {
      throw new Error("registration should require email verification and should not return tokens");
    }
    await expectStatus("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginType: "email", identifier: sessionStudentEmail, password: "password123" })
    }, 403, "login before email verification");
    await request("/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: sessionStudentEmail })
    });
    const verifiedUserBody = await request("/auth/otp/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: sessionStudentEmail, code: "123456" })
    });
    if (!verifiedUserBody.data.verified || !verifiedUserBody.data.accessToken || !verifiedUserBody.data.refreshToken) {
      throw new Error("email verification did not return accessToken and refreshToken");
    }
    const newUserHeaders = { authorization: `Bearer ${verifiedUserBody.data.accessToken}` };
    await expectStatus("/trade/quotes", {
      method: "POST",
      headers: { ...newUserHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "buy", fromAsset: "USDT", toAsset: "BTC", fromAmount: 50 })
    }, 403, "unverified trade limit");
    await expectStatus("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...newUserHeaders, "content-type": "application/json" },
      body: JSON.stringify({ amount: 500 })
    }, 403, "unverified deposit limit");
    const refreshBody = await request("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: verifiedUserBody.data.refreshToken })
    });
    await expectStatus("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: verifiedUserBody.data.refreshToken })
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

    const enableBody = await request("/auth/2fa/enable", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ code: twoFactorCode })
    });
    if (!Array.isArray(enableBody.data.recoveryCodes) || enableBody.data.recoveryCodes.length !== 8) {
      throw new Error("2FA enable did not return recovery codes");
    }

    const regeneratedCodesBody = await request("/auth/2fa/recovery-codes/regenerate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ password: "password123", code: generateTotpCode(setupBody.data.secret) })
    });

    const challengeBody = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginType: "email", identifier: "student@cryptoclass.test", password: "password123" })
    });
    if (challengeBody.data.attemptsRemaining !== 5) {
      throw new Error("2FA login challenge did not include attemptsRemaining");
    }

    await expectBadRequest("/auth/2fa/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: challengeBody.data.challengeId, code: "abc123" })
    }, "invalid 2FA attempt");
    await request("/auth/2fa/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: challengeBody.data.challengeId, recoveryCode: regeneratedCodesBody.data.recoveryCodes[0] })
    });

    await request("/auth/2fa/disable", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ password: "password123", code: generateTotpCode(setupBody.data.secret) })
    });

    await request("/market/assets");
    await requestText("/assets/btc.svg");
    const assetsWithSparklineBody = await request("/market/assets?page=1&limit=5&search=bit&sort=priceUsd&order=desc&include=sparkline");
    if (!Array.isArray(assetsWithSparklineBody.data[0]?.sparkline) || assetsWithSparklineBody.data[0].sparkline.length === 0) {
      throw new Error("market assets did not return sparkline data when requested");
    }
    await request("/market/prices");
    const streamBody = await requestFirstSseEvent("/market/stream");
    if (!Array.isArray(streamBody.data) || typeof streamBody.data[0]?.priceUsd !== "number") {
      throw new Error("market stream did not return live price rows");
    }
    const trendingBody = await request("/market/trending");
    if (!Array.isArray(trendingBody.data[0]?.sparkline) || trendingBody.data[0].sparkline.length === 0) {
      throw new Error("market trending did not return default sparkline data");
    }
    if (trendingBody.meta?.featured?.type !== "top_gainer" || typeof trendingBody.meta.featured.change24h !== "number") {
      throw new Error("market trending did not return top gainer metadata");
    }
    const candleBody = await request("/market/assets/BTC/candles?interval=1m&limit=5");
    if (candleBody.meta.interval !== "1m" || candleBody.data.length !== 5 || typeof candleBody.data[0]?.closeUsd !== "number") {
      throw new Error("market candles did not return expected candle data");
    }
    const assetDetailBody = await request("/market/assets/BTC");
    if (typeof assetDetailBody.data.stats?.marketCapUsd !== "number" || typeof assetDetailBody.data.stats?.volume24hUsd !== "number") {
      throw new Error("market asset detail did not return simulated stats");
    }
    const orderBookBody = await request("/market/assets/BTC/order-book?levels=5");
    if (orderBookBody.data.bids.length !== 5 || orderBookBody.data.asks.length !== 5 || typeof orderBookBody.data.spreadUsd !== "number") {
      throw new Error("market order book did not return expected levels");
    }
    const marketTradesBody = await request("/market/assets/BTC/trades?limit=5");
    if (marketTradesBody.data.length !== 5 || typeof marketTradesBody.data[0]?.totalUsd !== "number") {
      throw new Error("market trades did not return expected recent trades");
    }
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
    await request("/me/settings", {
      method: "PATCH",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ fiatCurrency: "EUR" })
    });
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
    const walletBody = await request("/wallet", { headers: userHeaders });
    if (walletBody.data.portfolioCurrency !== "EUR" || typeof walletBody.data.portfolioValue !== "number") {
      throw new Error("wallet did not return portfolio value in selected fiat currency");
    }
    if (!walletBody.data.verification?.tier || typeof walletBody.data.verification?.limits?.tradePerTransactionUsd !== "number") {
      throw new Error("wallet did not return expected KYC limit profile");
    }
    const portfolioHistoryBody = await request("/wallet/portfolio/history?range=1M", { headers: userHeaders });
    if (portfolioHistoryBody.meta.currency !== "EUR" || typeof portfolioHistoryBody.meta.latestValue !== "number") {
      throw new Error("portfolio history did not return selected fiat currency metadata");
    }
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
    const adminUsersBody = await request("/admin/users?page=1&limit=2&q=Ada", { headers: adminHeaders });
    if (adminUsersBody.meta?.limit !== 2 || !adminUsersBody.meta?.requestId) {
      throw new Error(`admin users pagination metadata was not returned: ${JSON.stringify(adminUsersBody.meta)}`);
    }
    await expectBadRequest("/admin/kyc?status=bogus", { headers: adminHeaders }, "invalid admin kyc status filter");
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
    const auditBody = await request("/admin/audit-logs?page=1&limit=10", { headers: adminHeaders });
    const actions = auditBody.data.map((log: { action: string }) => log.action);
    if (!actions.includes("asset.status_update") || !actions.includes("kyc.review")) {
      throw new Error(`admin audit logs did not include expected actions: ${JSON.stringify(actions)}`);
    }

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

    const depositIdempotencyKey = `smoke-deposit-${Date.now()}`;
    const depositBody = await request("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json", "idempotency-key": depositIdempotencyKey },
      body: JSON.stringify({ amount: 500, settlementDelaySeconds: 1 })
    });
    const replayedDepositBody = await request("/wallet/deposit/simulate", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json", "idempotency-key": depositIdempotencyKey },
      body: JSON.stringify({ amount: 500, settlementDelaySeconds: 1 })
    });
    if (replayedDepositBody.data.transaction.id !== depositBody.data.transaction.id) {
      throw new Error("deposit idempotency did not replay the original transaction");
    }
    await request("/admin/deposits?page=1&limit=10&status=pending", { headers: adminHeaders });
    await request(depositBody.data.pollingUrl, { headers: userHeaders });
    await wait(1200);
    await request(depositBody.data.pollingUrl, { headers: userHeaders });
    await request("/admin/deposits?page=1&limit=10&status=completed", { headers: adminHeaders });

    await expectBadRequest("/trade/quotes", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "buy", fromAsset: "USDT", toAsset: "BTC", fromAmount: "50" })
    }, "invalid quote amount");
    const quoteBody = await request("/trade/quotes", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "buy", fromAsset: "USDT", toAsset: "BTC", fromAmount: 50 })
    });
    await request(`/trade/quotes/${quoteBody.data.id}`, { headers: userHeaders });

    const tradeIdempotencyKey = `smoke-trade-${Date.now()}`;
    const tradeExecutionBody = await request("/trade/execute", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json", "idempotency-key": tradeIdempotencyKey },
      body: JSON.stringify({ quoteId: quoteBody.data.id, pin: "1234" })
    });
    const replayedTradeExecutionBody = await request("/trade/execute", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json", "idempotency-key": tradeIdempotencyKey },
      body: JSON.stringify({ quoteId: quoteBody.data.id, pin: "1234" })
    });
    if (replayedTradeExecutionBody.data.transaction.id !== tradeExecutionBody.data.transaction.id) {
      throw new Error("trade execution idempotency did not replay the original transaction");
    }

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
