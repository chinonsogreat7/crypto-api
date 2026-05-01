import { createApp } from "./app";
import { bootstrapDatabase } from "./data/persistence";

const port = Number(process.env.PORT || 4200);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

async function main() {
  await bootstrapDatabase();

  app.listen(port, host, () => {
    console.log(`Crypto Trade API listening on http://${host}:${port}`);
    console.log(`API docs available at http://${host}:${port}/docs`);
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exitCode = 1;
});
