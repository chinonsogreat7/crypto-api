import { createApp } from "./app";
import { bootstrapDatabase } from "./data/persistence";
import { startMarketSimulator } from "./data/market-simulator";

const port = Number(process.env.PORT || 4200);
const host = process.env.HOST || (process.env.RENDER === "true" ? "0.0.0.0" : "127.0.0.1");
const app = createApp();

async function main() {
  await bootstrapDatabase();
  startMarketSimulator();

  app.listen(port, host, () => {
    console.log(`Crypto Trade API listening on http://${host}:${port}`);
    console.log(`API docs available at http://${host}:${port}/docs`);
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exitCode = 1;
});
