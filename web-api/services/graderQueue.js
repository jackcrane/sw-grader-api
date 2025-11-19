import amqplib from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://db.jackcrane.rocks";
const GRADER_QUEUE_NAME =
  process.env.GRADER_QUEUE_NAME || "grader.submissions";
const QUEUE_DEPTH_POLL_MS = Number(
  process.env.GRADER_QUEUE_DEPTH_POLL_MS || 5000
);

let connectionPromise = null;
let publishChannelPromise = null;
let consumeChannelPromise = null;
let depthPollHandle = null;
let lastQueueDepth = 0;
let activeProcessors = 0;

const metricListeners = new Set();

const notifyMetricListeners = () => {
  const metrics = {
    queued: Math.max(0, lastQueueDepth),
    processing: Math.max(0, activeProcessors),
  };
  metrics.totalPending = metrics.queued + metrics.processing;

  for (const listener of metricListeners) {
    try {
      listener({ ...metrics });
    } catch (error) {
      console.warn("Queue metrics listener threw", error);
    }
  }
  return metrics;
};

const setQueueDepth = (value) => {
  const numericValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : 0;
  if (numericValue === lastQueueDepth) {
    return notifyMetricListeners();
  }
  lastQueueDepth = numericValue;
  return notifyMetricListeners();
};

const incrementProcessors = () => {
  activeProcessors += 1;
  notifyMetricListeners();
};

const decrementProcessors = () => {
  activeProcessors = Math.max(0, activeProcessors - 1);
  notifyMetricListeners();
};

const attachConnectionHandlers = (connection) => {
  connection.on("close", () => {
    console.warn("RabbitMQ connection closed. Reconnecting on next use.");
    connectionPromise = null;
    publishChannelPromise = null;
    consumeChannelPromise = null;
  });
  connection.on("error", (error) => {
    console.warn("RabbitMQ connection error", error?.message || error);
  });
  return connection;
};

const getConnection = async () => {
  if (!connectionPromise) {
    connectionPromise = amqplib
      .connect(RABBITMQ_URL)
      .then(attachConnectionHandlers)
      .catch((error) => {
        connectionPromise = null;
        console.error("Failed to connect to RabbitMQ", error);
        throw error;
      });
  }
  return connectionPromise;
};

const attachChannelHandlers = (channel, type) => {
  channel.on("close", () => {
    if (type === "publish") {
      publishChannelPromise = null;
    } else if (type === "consume") {
      consumeChannelPromise = null;
    }
  });
  channel.on("error", (error) => {
    console.warn(`RabbitMQ ${type} channel error`, error?.message || error);
  });
  return channel;
};

const getPublishChannel = async () => {
  if (!publishChannelPromise) {
    publishChannelPromise = getConnection()
      .then(async (connection) => {
        const channel = await connection.createConfirmChannel();
        await channel.assertQueue(GRADER_QUEUE_NAME, { durable: true });
        return attachChannelHandlers(channel, "publish");
      })
      .catch((error) => {
        publishChannelPromise = null;
        throw error;
      });
  }
  return publishChannelPromise;
};

const getConsumerChannel = async () => {
  if (!consumeChannelPromise) {
    consumeChannelPromise = getConnection()
      .then(async (connection) => {
        const channel = await connection.createChannel();
        await channel.assertQueue(GRADER_QUEUE_NAME, { durable: true });
        return attachChannelHandlers(channel, "consume");
      })
      .catch((error) => {
        consumeChannelPromise = null;
        throw error;
      });
  }
  return consumeChannelPromise;
};

const refreshQueueDepth = async () => {
  try {
    const channel = await getConsumerChannel();
    const stats = await channel.checkQueue(GRADER_QUEUE_NAME);
    return setQueueDepth(stats?.messageCount ?? 0);
  } catch (error) {
    console.warn("Unable to read queue depth", error?.message || error);
    throw error;
  }
};

const startDepthPolling = () => {
  if (depthPollHandle) return;
  depthPollHandle = setInterval(() => {
    refreshQueueDepth().catch(() => {});
  }, QUEUE_DEPTH_POLL_MS);
  refreshQueueDepth().catch(() => {});
};

export const startGraderQueue = async () => {
  await Promise.all([getPublishChannel(), getConsumerChannel()]);
  startDepthPolling();
};

export const getQueueMetrics = () => {
  const queued = Math.max(0, lastQueueDepth);
  const processing = Math.max(0, activeProcessors);
  return {
    queued,
    processing,
    totalPending: queued + processing,
  };
};

export const subscribeToQueueMetrics = (listener) => {
  if (typeof listener !== "function") return () => {};
  metricListeners.add(listener);
  try {
    listener(getQueueMetrics());
  } catch (error) {
    console.warn("Queue metrics listener threw on subscribe", error);
  }
  return () => metricListeners.delete(listener);
};

const parseJobMessage = (msg) => {
  if (!msg?.content) return null;
  try {
    return JSON.parse(msg.content.toString());
  } catch {
    return null;
  }
};

export const enqueueSubmissionJob = async (
  payload,
  { trackPosition = true } = {}
) => {
  if (!payload || typeof payload.submissionId !== "string") {
    throw new Error("enqueueSubmissionJob requires a submissionId.");
  }
  await startGraderQueue();
  const depthBefore = trackPosition
    ? (await refreshQueueDepth().catch(() => getQueueMetrics())).queued
    : getQueueMetrics().queued;

  const channel = await getPublishChannel();
  channel.sendToQueue(GRADER_QUEUE_NAME, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: "application/json",
  });
  await channel.waitForConfirms();

  const metrics = trackPosition
    ? await refreshQueueDepth().catch(() => getQueueMetrics())
    : getQueueMetrics();

  if (!trackPosition) {
    return {
      aheadCount: null,
      position: null,
      queueDepth: metrics.queued,
    };
  }

  const aheadCount = Math.max(0, depthBefore);
  return {
    aheadCount,
    position: aheadCount + 1,
    queueDepth: metrics.queued,
  };
};

export const consumeSubmissionJobs = async (handler) => {
  if (typeof handler !== "function") {
    throw new Error("consumeSubmissionJobs requires a handler function.");
  }
  await startGraderQueue();
  const channel = await getConsumerChannel();
  await channel.prefetch(1);
  await channel.consume(GRADER_QUEUE_NAME, async (msg) => {
    if (!msg) return;
    const job = parseJobMessage(msg);
    if (!job?.submissionId) {
      console.warn("Skipping malformed submission job", job);
      channel.ack(msg);
      await refreshQueueDepth().catch(() => {});
      return;
    }

    incrementProcessors();
    try {
      await handler(job);
      channel.ack(msg);
    } catch (error) {
      console.error(
        `Submission job ${job.submissionId} failed; requeueing`,
        error
      );
      channel.nack(msg, false, true);
    } finally {
      decrementProcessors();
      await refreshQueueDepth().catch(() => {});
    }
  });
};
