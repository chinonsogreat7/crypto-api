import path from "path";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { marketRouter } from "./routes/market";
import { meRouter } from "./routes/me";
import { tradingRouter } from "./routes/trading";
import { walletRouter } from "./routes/wallet";
import { saveCurrentDatabase } from "./data/persistence";
import { errorHandler, notFoundHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));
  app.use((req, res, next) => {
    res.on("finish", () => {
      const shouldPersist = ["POST", "PATCH", "DELETE"].includes(req.method) && res.statusCode < 400;
      if (shouldPersist) {
        saveCurrentDatabase().catch((error) => {
          console.error("Failed to persist database changes", error);
        });
      }
    });
    next();
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "crypto-trade-api",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/openapi.yaml", (req, res) => {
    res.type("text/yaml");
    res.sendFile(path.join(process.cwd(), "docs", "openapi.yaml"));
  });

  app.get("/docs", (req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crypto Trade API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/openapi.yaml", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`);
  });

  app.use("/admin-ui", express.static(path.join(process.cwd(), "public", "admin")));
  app.get("/admin-ui", (req, res) => {
    res.redirect("/admin-ui/");
  });

  app.put<{ 0: string }>("/storage/uploads/*", express.raw({ type: "*/*", limit: "5mb" }), (req, res) => {
    res.status(201).json({
      data: {
        uploaded: true,
        storageKey: req.params[0],
        sizeBytes: Buffer.isBuffer(req.body) ? req.body.length : 0
      }
    });
  });

  app.get<{ 0: string }>("/storage/files/*", (req, res) => {
    res.json({
      data: {
        storageKey: req.params[0],
        url: req.originalUrl,
        note: "Demo storage metadata. Replace this with S3, Cloudinary, or Supabase Storage in production."
      }
    });
  });

  app.use("/auth", authRouter);
  app.use("/me", meRouter);
  app.use("/market", marketRouter);
  app.use("/wallet", walletRouter);
  app.use("/trade", tradingRouter);
  app.use("/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
