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
import { startBillingFollowUpWorker } from "./services/billingFollowUpWorker.js";
import { startCanvasGradePassbackWorker } from "./services/canvasGradePassback.js";

dotenv.config();

const app = express();
app.use(
  express.json({
    limit: "20mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());

// Logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

const tryParseUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};
const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed =
    tryParseUrl(trimmed) ||
    (!trimmed.includes("://") ? tryParseUrl(`https://${trimmed}`) : null);
  if (parsed) {
    return parsed.origin;
  }
  return trimmed.replace(/\/+$/, "");
};
const resolvePublicBaseUrl = (req) => {
  const envUrl =
    sanitizeBaseUrl(process.env.PUBLIC_APP_URL) ||
    sanitizeBaseUrl(process.env.APP_PUBLIC_URL) ||
    sanitizeBaseUrl(process.env.APP_URL);
  if (envUrl) return envUrl;
  const protoHeader = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(
      ","
    )[0] ||
    req.protocol ||
    "https";
  const host = req.get("host") || "featurebench.com";
  return `${protocol}://${host}`.replace(/\/+$/, "");
};

const buildCanvasConfigXml = (baseUrl) => {
  const safeBaseUrl = sanitizeBaseUrl(baseUrl) || "https://featurebench.com";
  let hostname = "featurebench.com";
  try {
    hostname = new URL(safeBaseUrl).hostname;
  } catch {
    // fall through to default hostname
  }
  const launchUrl = `${safeBaseUrl}/api/lti/canvas/launch`;
  const deepLinkUrl = `${safeBaseUrl}/api/lti/canvas/deep-link`;
  const gradeSyncUrl = `${safeBaseUrl}/api/lti/canvas/grades`;
  const courseNavUrl = launchUrl;
  const iconUrl = `${safeBaseUrl}/assets/featurebench-flower-contrast.svg`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p0" ` +
    `xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0" ` +
    `xmlns:lticm="http://www.imsglobal.org/xsd/imslticm_v1p0" ` +
    `xmlns:lticp="http://www.imsglobal.org/xsd/imslticp_v1p0" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.imsglobal.org/xsd/imslticc_v1p0 ` +
    `http://www.imsglobal.org/xsd/lti/ltiv1p0/imslticc_v1p0.xsd">` +
    `<blti:title>FeatureBench</blti:title>` +
    `<blti:description>Connect FeatureBench assignments to Canvas for automatic assignment and grade sync.</blti:description>` +
    `<blti:launch_url>${launchUrl}</blti:launch_url>` +
    `<blti:icon>${iconUrl}</blti:icon>` +
    `<blti:extensions platform="canvas.instructure.com">` +
    `<lticm:property name="tool_id">featurebench</lticm:property>` +
    `<lticm:property name="domain">${hostname}</lticm:property>` +
    `<lticm:property name="privacy_level">public</lticm:property>` +
    `<lticm:property name="text">FeatureBench</lticm:property>` +
    `<lticm:property name="selection_height">650</lticm:property>` +
    `<lticm:property name="selection_width">900</lticm:property>` +
    `<lticm:options name="course_navigation">` +
    `<lticm:property name="url">${courseNavUrl}</lticm:property>` +
    `<lticm:property name="default">enabled</lticm:property>` +
    `<lticm:property name="enabled">true</lticm:property>` +
    `<lticm:property name="text">FeatureBench</lticm:property>` +
    `<lticm:property name="icon_url">${iconUrl}</lticm:property>` +
    `</lticm:options>` +
    `<lticm:options name="assignment_selection">` +
    `<lticm:property name="url">${deepLinkUrl}</lticm:property>` +
    `<lticm:property name="enabled">true</lticm:property>` +
    `<lticm:property name="text">Add FeatureBench Assignment</lticm:property>` +
    `<lticm:property name="icon_url">${iconUrl}</lticm:property>` +
    `<lticm:property name="selection_height">650</lticm:property>` +
    `<lticm:property name="selection_width">900</lticm:property>` +
    `</lticm:options>` +
    `<lticm:options name="grade_passback">` +
    `<lticm:property name="url">${gradeSyncUrl}</lticm:property>` +
    `</lticm:options>` +
    `</blti:extensions>` +
    `<cartridge_bundle identifierref="BLTI001_Bundle"/>` +
    `<cartridge_icon identifierref="BLTI001_Icon"/>` +
    `</cartridge_basiclti_link>`
  );
};

startGraderHealthMonitor();
startPendingSubmissionWorker();
startBillingFollowUpWorker();
startCanvasGradePassbackWorker();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const routesDir = path.join(__dirname, "routes");

app.get("/integrations/canvas.xml", (req, res) => {
  console.log("canvas.xml request", req.headers);
  const baseUrl = resolvePublicBaseUrl(req);
  res.type("application/xml").send(buildCanvasConfigXml(baseUrl));
});

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
    if (!["GET", "HEAD"].includes(req.method)) return next();
    if (req.path.startsWith("/api")) return next(); // let API routes handle

    // If it looks like a file request (has an extension), let static/404 handle it
    if (path.extname(req.path)) return next();

    const acceptHeader = (req.headers.accept || "").toLowerCase();
    const acceptsHTML =
      !acceptHeader ||
      acceptHeader.includes("text/html") ||
      acceptHeader.includes("*/*");
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
