// server/index.js
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { registerRoutes } from "./util/router.js";
import { startGraderHealthMonitor } from "./services/graderHealth.js";
import { startPendingSubmissionWorker } from "./services/pendingSubmissionWorker.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(cookieParser());

startGraderHealthMonitor();
startPendingSubmissionWorker();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.join(__dirname, "routes");

const serveFrontend = () => {
  const frontendDir = path.resolve(__dirname, "../app/dist");
  const indexHtml = path.join(frontendDir, "index.html");

  if (!fs.existsSync(frontendDir) || !fs.existsSync(indexHtml)) {
    console.warn("Skipping static frontend serving, build output not found.");
    return;
  }

  // Serve built assets, but don't auto-serve index.html
  app.use(express.static(frontendDir, { index: false }));

  // SPA fallback WITHOUT a route pattern (avoids path-to-regexp parsing)
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next(); // let API routes handle

    // If it looks like a file request (has an extension), let static/404 handle it
    if (path.extname(req.path)) return next();

    // Only for HTML navigations
    const acceptsHTML =
      req.headers.accept && req.headers.accept.includes("text/html");
    if (!acceptsHTML) return next();

    res.sendFile(indexHtml);
  });
};

const startServer = async () => {
  // Mount API first (ideally under /api)
  await registerRoutes(app, routesDir);

  // Then static assets + SPA fallback
  serveFrontend();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

startServer();
