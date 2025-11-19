import crypto from "node:crypto";
import amqplib from "amqplib";
import {
  recordAnalyzerFailure,
  recordAnalyzerSuccess,
} from "./graderHealth.js";
import { uploadObject, deleteObject } from "../util/s3.js";
import { getExtension, sanitizeKeySegment } from "./submissionUtils.js";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://db.jackcrane.rocks";
const GRADER_QUEUE_NAME =
  process.env.GRADER_QUEUE_NAME || "grader.submissions";
const ANALYZER_TIMEOUT_MS = Number(
  process.env.ANALYZER_TIMEOUT_MS || 1000 * 60 * 2
);
const ANALYZER_ASSET_PREFIX = "analyzer/prescans";

let rpcConnectionPromise = null;
let rpcChannelPromise = null;
let replyQueueName = null;

const pendingResponses = new Map();

const failPendingResponses = (reason) => {
  if (pendingResponses.size === 0) return;
  const error =
    reason ||
    new Error("Analyzer queue connection closed before completing request.");
  error.analyzerDispatched = true;
  for (const pending of pendingResponses.values()) {
    clearTimeout(pending.timeout);
    try {
      pending.reject(error);
    } catch {
      // ignore
    }
  }
  pendingResponses.clear();
};

const attachConnectionHandlers = (connection) => {
  connection.on("error", (error) => {
    console.warn(
      "Analyzer queue connection error",
      error?.message || error
    );
  });
  connection.on("close", () => {
    console.warn("Analyzer queue connection closed. Reconnecting on demand.");
    rpcConnectionPromise = null;
    rpcChannelPromise = null;
    replyQueueName = null;
    failPendingResponses();
  });
  return connection;
};

const getRpcConnection = async () => {
  if (!rpcConnectionPromise) {
    rpcConnectionPromise = amqplib
      .connect(RABBITMQ_URL)
      .then(attachConnectionHandlers)
      .catch((error) => {
        rpcConnectionPromise = null;
        console.error("Failed to connect to analyzer queue", error);
        throw error;
      });
  }
  return rpcConnectionPromise;
};

const attachChannelHandlers = (channel) => {
  channel.on("error", (error) => {
    console.warn("Analyzer queue channel error", error?.message || error);
  });
  channel.on("close", () => {
    console.warn("Analyzer queue channel closed.");
    rpcChannelPromise = null;
    replyQueueName = null;
    failPendingResponses();
  });
  return channel;
};

const getRpcChannel = async () => {
  if (!rpcChannelPromise) {
    rpcChannelPromise = getRpcConnection()
      .then(async (connection) => {
        const channel = await connection.createChannel();
        await channel.assertQueue(GRADER_QUEUE_NAME, { durable: true });
        return attachChannelHandlers(channel);
      })
      .catch((error) => {
        rpcChannelPromise = null;
        throw error;
      });
  }
  return rpcChannelPromise;
};

const handleReplyMessage = (msg) => {
  if (!msg?.properties?.correlationId) return;
  const pending = pendingResponses.get(msg.properties.correlationId);
  if (!pending) return;
  pendingResponses.delete(msg.properties.correlationId);
  clearTimeout(pending.timeout);
  try {
    const text = msg.content?.toString?.() || "";
    const payload = text ? JSON.parse(text) : null;
    pending.resolve(payload);
  } catch (error) {
    pending.reject(error);
  }
};

const ensureReplyQueue = async () => {
  if (replyQueueName) return replyQueueName;
  const channel = await getRpcChannel();
  const { queue } = await channel.assertQueue("", { exclusive: true });
  await channel.consume(queue, handleReplyMessage, { noAck: true });
  replyQueueName = queue;
  return replyQueueName;
};

const sendAnalyzerJob = async (payload) => {
  const channel = await getRpcChannel();
  const replyQueue = await ensureReplyQueue();
  const correlationId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingResponses.delete(correlationId);
      const error = new Error("Analyzer request timed out.");
      error.analyzerDispatched = true;
      reject(error);
    }, ANALYZER_TIMEOUT_MS);

    pendingResponses.set(correlationId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      timeout,
    });

    try {
      channel.sendToQueue(
        GRADER_QUEUE_NAME,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: "application/json",
          replyTo: replyQueue,
          correlationId,
          persistent: true,
        }
      );
    } catch (error) {
      pendingResponses.delete(correlationId);
      clearTimeout(timeout);
      error.analyzerDispatched = false;
      reject(error);
    }
  });
};

const buildAnalyzerAssetKey = (filename = "submission.sldprt") => {
  const extension = getExtension(filename, ".sldprt") || ".sldprt";
  const safeExtension = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
  const safeName = sanitizeKeySegment(nameWithoutExt, "part");
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return `${ANALYZER_ASSET_PREFIX}/${safeName || "part"}-${unique}${safeExtension}`;
};

const requestAnalysis = async (payload) => {
  const response = await sendAnalyzerJob(payload);
  if (!response) {
    throw new Error("Analyzer worker returned an empty response.");
  }
  if (response.ok === false) {
    throw new Error(
      response.error || "Analyzer worker failed to process this file."
    );
  }
  return response.result ?? response;
};

export const analyzePart = async ({
  fileBuffer,
  filename = "submission.sldprt",
  unitSystem,
  mimeType = "application/octet-stream",
}) => {
  if (!fileBuffer) {
    throw new Error("analyzePart requires a file buffer.");
  }

  let upload = null;
  try {
    upload = await uploadObject({
      key: buildAnalyzerAssetKey(filename),
      body: fileBuffer,
      contentType: mimeType,
    });

    const result = await requestAnalysis({
      type: "prescan",
      jobId: crypto.randomUUID(),
      fileKey: upload.key,
      cleanupKey: upload.key,
      fileName: filename,
      unitSystem,
    });

    recordAnalyzerSuccess();
    return result;
  } catch (error) {
    if (upload?.key && error?.analyzerDispatched === false) {
      await deleteObject(upload.key).catch(() => {});
    }
    recordAnalyzerFailure(error);
    throw error;
  }
};
