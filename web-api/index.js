import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { registerRoutes } from "./util/router.js";
import { loginHandler } from "./routes/auth/login.js";
import { callbackHandler } from "./routes/auth/callback.js";
import { logoutHandler } from "./routes/auth/logout.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.join(__dirname, "routes");

const registerPublicRoutes = () => {
  app.get("/login", loginHandler);
  app.get("/callback", callbackHandler);
  app.all("/logout", logoutHandler);
};

const serveFrontend = () => {
  const frontendDir = path.resolve(__dirname, "../app/dist");
  if (!fs.existsSync(frontendDir)) {
    console.warn("Skipping static frontend serving, build output not found.");
    return;
  }

  app.use(express.static(frontendDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (["/login", "/logout", "/callback"].includes(req.path)) return next();

    return res.sendFile(path.join(frontendDir, "index.html"));
  });
};

const startServer = async () => {
  await registerRoutes(app, routesDir);
  registerPublicRoutes();
  serveFrontend();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

startServer();
