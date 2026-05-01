import { createApp } from "../src/app";
import { bootstrapDatabase } from "../src/data/persistence";

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
    await request("/market/assets");
    await request("/market/trending");
    await request("/me", { headers: userHeaders });
    await request("/me/settings", { headers: userHeaders });
    await request("/me/watchlist", { headers: userHeaders });
    await request("/me/notifications", { headers: userHeaders });
    await request("/wallet", { headers: userHeaders });
    await request("/wallet/deposit-addresses/USDC", { headers: userHeaders });
    await requestText("/admin-ui/");
    await request("/admin/dashboard", { headers: adminHeaders });
    await request("/admin/fees", { headers: adminHeaders });

    await request("/admin/kyc/kyc_student", {
      method: "PATCH",
      headers: { ...adminHeaders, "content-type": "application/json" },
      body: JSON.stringify({ status: "approved", reviewerNote: "Approved for classroom demo." })
    });

    const quoteBody = await request("/trade/quotes", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ type: "swap", fromAsset: "ETH", toAsset: "USDC", fromAmount: 0.1 })
    });

    await request("/trade/execute", {
      method: "POST",
      headers: { ...userHeaders, "content-type": "application/json" },
      body: JSON.stringify({ quoteId: quoteBody.data.id, pin: "1234" })
    });

    await request("/wallet/transactions", { headers: userHeaders });
    console.log("Smoke test passed.");
  } finally {
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
