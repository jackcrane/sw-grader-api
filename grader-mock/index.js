#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import process from "node:process";
import amqplib from "amqplib";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const QUEUE_NAME = process.env.GRADER_QUEUE_NAME || "grader.submissions";
const RESULT_BASE =
  process.env.GRADER_RESULT_BASE_URL ||
  process.env.WEB_API_BASE_URL ||
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_APP_URL ||
  "http://localhost:3000";
const RESULT_URL_BASE = RESULT_BASE.replace(/\/+$/, "");
const GRADER_BASE_URL = process.env.GRADER_BASE_URL || "http://localhost:3999";
const RESULT_SECRET =
  process.env.GRADER_SHARED_SECRET?.trim() || "featurebench-shared-secret";
const RECONNECT_DELAY_MS = 5000;
const AWS_BUCKET = process.env.AWS_BUCKET;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ENDPOINT = process.env.AWS_ENDPOINT;
const AWS_ACL = process.env.AWS_ACL || undefined;
const AWS_FORCE_PATH_STYLE =
  String(process.env.AWS_FORCE_PATH_STYLE).toLowerCase() === "true";
const s3Client =
  AWS_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: AWS_REGION,
        endpoint: AWS_ENDPOINT || undefined,
        forcePathStyle: AWS_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;
const s3BaseUrl = (() => {
  const override = process.env.AWS_PUBLIC_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  if (AWS_ENDPOINT && AWS_BUCKET) {
    try {
      const endpointUrl = new URL(AWS_ENDPOINT);
      return `${endpointUrl.protocol}//${AWS_BUCKET}.${endpointUrl.host}`;
    } catch {
      // ignore
    }
  }
  if (AWS_BUCKET) {
    return `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
  }
  return null;
})();

console.log(`S3 bucket: ${s3BaseUrl}`);

const describeJob = (job) => {
  if (!job) return "job";
  if (job.submissionId) return `submission ${job.submissionId}`;
  if (job.jobId) return `job ${job.jobId}`;
  if (job.fileName) return job.fileName;
  if (job.fileKey) return job.fileKey;
  return "job";
};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));

const log = (...args) => console.log("[grader-mock]", ...args);
const warn = (...args) => console.warn("[grader-mock]", ...args);
const err = (...args) => console.error("[grader-mock]", ...args);

const ensureFixturesDir = async () => {
  await fs.mkdir(FIXTURE_DIR, { recursive: true }).catch(() => {});
};

const buildPublicS3Url = (key) => {
  if (!key || !s3BaseUrl) return null;
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${s3BaseUrl}/${encoded}`;
};

const decodeImageBase64 = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let payload = trimmed;
  let meta = "";
  if (trimmed.startsWith("data:")) {
    const commaIndex = trimmed.indexOf(",");
    if (commaIndex === -1) return null;
    meta = trimmed.slice(5, commaIndex);
    payload = trimmed.slice(commaIndex + 1);
  }
  const metaParts = meta.split(";");
  const contentType =
    metaParts.length > 0 && metaParts[0] ? metaParts[0] : "image/png";
  try {
    return {
      buffer: Buffer.from(payload, "base64"),
      contentType,
    };
  } catch {
    return null;
  }
};

const normalizeFixtureKey = (value) => {
  if (!value) return null;
  return value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const registerCandidate = (set, candidate) => {
  if (!candidate) return;
  const normalized = normalizeFixtureKey(candidate);
  if (!normalized) return;
  if (!set.has(normalized)) {
    set.add(normalized);
  }
};

const deriveFixtureCandidates = (job) => {
  const candidates = new Set();

  const pushForValue = (value) => {
    if (!value) return;
    const base = value.split(/[/\\]/).pop();
    if (!base) return;
    registerCandidate(candidates, base);
    registerCandidate(candidates, base.toLowerCase());
    const withoutExt = base.replace(/\.[^.]+$/, "");
    registerCandidate(candidates, withoutExt);
    registerCandidate(candidates, withoutExt.toLowerCase());
  };

  pushForValue(job?.fileName);
  pushForValue(job?.fileKey);
  candidates.add("default");

  return Array.from(candidates);
};

const buildScreenshotKey = (job, fixtureKey) => {
  const jobSegment =
    normalizeFixtureKey(
      job?.submissionId || job?.jobId || job?.fileName || job?.fileKey
    ) || "job";
  const fixtureSegment = normalizeFixtureKey(fixtureKey) || "fixture";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return [
    "grader-mock",
    "screenshots",
    jobSegment,
    fixtureSegment,
    `${unique}.png`,
  ]
    .filter(Boolean)
    .join("/");
};

const uploadFixtureScreenshot = async ({ job, fixtureKey, base64Value }) => {
  if (!s3Client || !AWS_BUCKET) return null;
  const decoded = decodeImageBase64(base64Value);
  if (!decoded?.buffer) {
    warn("Unable to parse fixture image for upload.");
    return null;
  }
  const key = buildScreenshotKey(job, fixtureKey);
  const command = new PutObjectCommand({
    Bucket: AWS_BUCKET,
    Key: key,
    Body: decoded.buffer,
    ContentType: decoded.contentType || "image/png",
    ACL: AWS_ACL,
  });
  await s3Client.send(command);
  return {
    key,
    url: buildPublicS3Url(key),
  };
};

const maybeUploadFixtureScreenshot = async (job, fixture, outcome) => {
  if (!outcome?.screenshotFromImageB64) return null;
  if (!s3Client || !AWS_BUCKET) {
    warn(
      "Skipping fixture screenshot upload; S3 is not configured in this environment."
    );
    return null;
  }
  try {
    const upload = await uploadFixtureScreenshot({
      job,
      fixtureKey: fixture?.key,
      base64Value: outcome.screenshotFromImageB64,
    });
    if (upload?.key) {
      log(
        `Uploaded fixture screenshot for ${describeJob(job)} to ${upload.key}`
      );
    }
    return upload;
  } catch (error) {
    warn(
      `Failed to upload fixture screenshot for ${describeJob(job)}`,
      error?.message || error
    );
    return null;
  }
};

const loadFixture = async (job) => {
  const candidates = deriveFixtureCandidates(job);
  for (const candidate of candidates) {
    const filePath = path.join(FIXTURE_DIR, `${candidate}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      return { key: candidate, filePath, data };
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw new Error(
        `Failed to load grader fixture ${filePath}: ${error?.message || error}`
      );
    }
  }
  return { key: null, filePath: null, data: null };
};

const buildFallbackError = (job) =>
  `Mock grader has no fixture configured for ${describeJob(job)}.`;

const parseFixturePayload = (job, fixture) => {
  const rawData = fixture?.data;
  let delayMs = 0;
  if (rawData && Number.isFinite(rawData.delayMs)) {
    delayMs = Math.max(0, Number(rawData.delayMs));
  }

  const payload = rawData && typeof rawData === "object" ? { ...rawData } : {};
  delete payload.delayMs;

  const screenshotFieldOrder = [
    "screenshot",
    "screenshotB64",
    "screenshotb64",
    "imageb64",
    "imageB64",
  ];
  let screenshotValue = null;
  let screenshotFromImageB64 = false;
  for (const field of screenshotFieldOrder) {
    const candidate = payload[field];
    if (typeof candidate === "string" && candidate.trim()) {
      screenshotValue = candidate.trim();
      if (field.toLowerCase().includes("image")) {
        screenshotFromImageB64 = true;
      }
      break;
    }
  }

  const errorMessage =
    typeof payload.error === "string" && payload.error.trim().length > 0
      ? payload.error.trim()
      : null;
  const volume = Number(payload.volume);
  const surfaceArea = Number(payload.surfaceArea);
  const featureTree =
    payload.featureTree === undefined ? undefined : payload.featureTree;

  if (
    !errorMessage &&
    (!Number.isFinite(volume) || !Number.isFinite(surfaceArea))
  ) {
    return {
      delayMs,
      error: buildFallbackError(job),
      measurements: null,
    };
  }

  if (errorMessage) {
    return {
      delayMs,
      error: errorMessage,
      measurements: null,
    };
  }

  return {
    delayMs,
    error: null,
    measurements: {
      volume,
      surfaceArea,
      screenshot: screenshotValue,
      featureTree,
    },
    screenshotFromImageB64: screenshotFromImageB64 ? screenshotValue : null,
  };
};

const buildSubmissionPayload = (outcome, screenshotUpload) => {
  if (outcome.error) {
    return { error: outcome.error };
  }
  const payload = {
    volume: outcome.measurements.volume,
    surfaceArea: outcome.measurements.surfaceArea,
  };
  if (outcome.measurements.screenshot) {
    payload.screenshot = outcome.measurements.screenshot;
  }
  if (outcome.measurements.featureTree !== undefined) {
    payload.featureTree = outcome.measurements.featureTree;
  }
  if (screenshotUpload?.key) {
    payload.screenshotKey = screenshotUpload.key;
  }
  if (screenshotUpload?.url) {
    payload.screenshotUrl = screenshotUpload.url;
  }
  return payload;
};

const buildAnalyzerResponse = (job, outcome, screenshotUpload) => {
  if (outcome.error) {
    return {
      ok: false,
      jobId: job?.jobId ?? null,
      error: outcome.error,
    };
  }
  return {
    ok: true,
    jobId: job?.jobId ?? null,
    result: {
      volume: outcome.measurements.volume,
      surfaceArea: outcome.measurements.surfaceArea,
      screenshotB64: outcome.measurements.screenshot ?? null,
      featureTree: outcome.measurements.featureTree ?? null,
      screenshotKey: screenshotUpload?.key ?? null,
      screenshotUrl: screenshotUpload?.url ?? null,
    },
  };
};

const buildResultUrl = (submissionId) => {
  if (!submissionId) {
    throw new Error("Submission job is missing submissionId.");
  }
  return `${RESULT_URL_BASE}/api/system/grader/submissions/${submissionId}/result`;
};

const sendSubmissionResult = async (submissionId, payload) => {
  const url = buildResultUrl(submissionId);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RESULT_SECRET ? { "x-grader-secret": RESULT_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Result callback failed (${response.status}): ${text?.slice?.(0, 120)}`
    );
  }
};

const isAnalyzerJob = (job, msg) => {
  if (job?.type === "prescan") return true;
  return Boolean(msg?.properties?.replyTo);
};

const createChannel = async () => {
  const connection = await amqplib.connect(RABBITMQ_URL);
  connection.on("error", (error) => {
    warn("RabbitMQ connection error", error?.message || error);
  });
  connection.on("close", () => {
    warn("RabbitMQ connection closed");
  });
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.prefetch(1);
  channel.on("error", (error) => {
    warn("RabbitMQ channel error", error?.message || error);
  });
  return { connection, channel };
};

const parseMessage = (msg) => {
  if (!msg?.content) return null;
  try {
    return JSON.parse(msg.content.toString());
  } catch (error) {
    warn("Failed to parse queue message", error?.message || error);
    return null;
  }
};

const startHealthServer = () => {
  const targetUrl = new URL(
    GRADER_BASE_URL.includes("://")
      ? GRADER_BASE_URL
      : `http://${GRADER_BASE_URL}`
  );
  const port =
    Number(targetUrl.port) || (targetUrl.protocol === "https:" ? 443 : 80);
  const hostname = targetUrl.hostname || "0.0.0.0";

  const server = http.createServer((req, res) => {
    const normalizedPath = req.url?.split("?")[0] || "/";
    if (normalizedPath === "/healthz") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (normalizedPath === "/") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          message: "FeatureBench grader mock is running.",
        })
      );
      return;
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  server.listen(port, hostname, () => {
    log(`Health endpoint listening on ${hostname}:${port}`);
  });

  server.on("error", (error) => {
    err("Health server error", error?.message || error);
  });

  return server;
};

let shuttingDown = false;
let activeConnection = null;
let activeChannel = null;
let healthServer = null;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down grader mock...");
  try {
    await activeChannel?.close();
  } catch {
    // ignore
  }
  try {
    await activeConnection?.close();
  } catch {
    // ignore
  }
  if (healthServer) {
    healthServer.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const handleQueueMessage = async (channel, msg) => {
  const job = parseMessage(msg);
  if (!job) {
    warn("Skipping empty grader message");
    channel.ack(msg);
    return;
  }
  const label = describeJob(job);
  const fixture = await loadFixture(job);
  const outcome = parseFixturePayload(job, fixture);
  if (outcome.delayMs > 0) {
    await sleep(outcome.delayMs);
  }
  let screenshotUpload = null;
  if (!outcome.error) {
    screenshotUpload = await maybeUploadFixtureScreenshot(
      job,
      fixture,
      outcome
    ).catch((uploadError) => {
      warn(
        `Screenshot upload failed for ${label}`,
        uploadError?.message || uploadError
      );
      return null;
    });
  }

  if (isAnalyzerJob(job, msg)) {
    const response = buildAnalyzerResponse(job, outcome, screenshotUpload);
    if (!msg.properties.replyTo) {
      warn(
        `Analyzer job ${label} is missing replyTo queue; dropping response.`
      );
    } else {
      channel.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(JSON.stringify(response)),
        {
          correlationId: msg.properties.correlationId,
          contentType: "application/json",
        }
      );
    }
    channel.ack(msg);
    log(
      `Handled analyzer job ${label} using fixture ${fixture.key || "<fallback>"}`
    );
    return;
  }

  try {
    await sendSubmissionResult(
      job.submissionId,
      buildSubmissionPayload(outcome, screenshotUpload)
    );
    channel.ack(msg);
    log(
      `Reported grading result for ${label} using fixture ${fixture.key || "<fallback>"}`
    );
  } catch (error) {
    channel.nack(msg, false, true);
    throw error;
  }
};

const startQueueConsumer = async () => {
  while (!shuttingDown) {
    try {
      const { connection, channel } = await createChannel();
      activeConnection = connection;
      activeChannel = channel;
      log(`Connected to ${RABBITMQ_URL}, consuming ${QUEUE_NAME}`);

      channel.consume(QUEUE_NAME, (msg) => {
        if (!msg) return;
        handleQueueMessage(channel, msg).catch((error) => {
          err(`Failed to process ${QUEUE_NAME} message`, error);
        });
      });

      await new Promise((resolve) => {
        connection.once("close", resolve);
      });

      if (!shuttingDown) {
        warn("RabbitMQ connection closed; reconnecting...");
        await sleep(RECONNECT_DELAY_MS);
      }
    } catch (error) {
      if (shuttingDown) break;
      err("Unable to start grader mock consumer", error);
      await sleep(RECONNECT_DELAY_MS);
    }
  }
};

const start = async () => {
  await ensureFixturesDir();
  healthServer = startHealthServer();
  await startQueueConsumer();
};

start().catch((error) => {
  err("Grader mock failed", error);
  process.exit(1);
});
