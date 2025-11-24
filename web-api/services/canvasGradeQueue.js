import amqplib from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://db.jackcrane.rocks";
const CANVAS_GRADE_QUEUE_NAME =
  process.env.CANVAS_GRADE_QUEUE_NAME || "canvas.gradepassback";

let connectionPromise = null;
let publishChannelPromise = null;
let consumeChannelPromise = null;

const attachConnectionHandlers = (connection) => {
  connection.on("close", () => {
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
    } else {
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
        await channel.assertQueue(CANVAS_GRADE_QUEUE_NAME, { durable: true });
        return attachChannelHandlers(channel, "publish");
      })
      .catch((error) => {
        publishChannelPromise = null;
        throw error;
      });
  }
  return publishChannelPromise;
};

const getConsumeChannel = async () => {
  if (!consumeChannelPromise) {
    consumeChannelPromise = getConnection()
      .then(async (connection) => {
        const channel = await connection.createChannel();
        await channel.assertQueue(CANVAS_GRADE_QUEUE_NAME, { durable: true });
        return attachChannelHandlers(channel, "consume");
      })
      .catch((error) => {
        consumeChannelPromise = null;
        throw error;
      });
  }
  return consumeChannelPromise;
};

export const startCanvasGradeQueue = async () => {
  await Promise.all([getPublishChannel(), getConsumeChannel()]);
};

const parseJobMessage = (msg) => {
  if (!msg?.content) return null;
  try {
    return JSON.parse(msg.content.toString());
  } catch {
    return null;
  }
};

export const enqueueCanvasGradeJob = async (payload) => {
  if (!payload || typeof payload.submissionId !== "string") {
    throw new Error("enqueueCanvasGradeJob requires a submissionId.");
  }
  await startCanvasGradeQueue();
  const channel = await getPublishChannel();
  console.log(
    `[Canvas Sync] Enqueuing submission ${payload.submissionId} for Canvas grade passback.`
  );
  channel.sendToQueue(
    CANVAS_GRADE_QUEUE_NAME,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      contentType: "application/json",
    }
  );
  await channel.waitForConfirms();
};

export const consumeCanvasGradeJobs = async (handler) => {
  if (typeof handler !== "function") {
    throw new Error("consumeCanvasGradeJobs requires a handler function.");
  }
  await startCanvasGradeQueue();
  const channel = await getConsumeChannel();
  await channel.prefetch(1);
  await channel.consume(CANVAS_GRADE_QUEUE_NAME, async (msg) => {
    if (!msg) return;
    const job = parseJobMessage(msg);
    if (!job?.submissionId) {
      console.warn("Skipping malformed Canvas grade job", job);
      channel.ack(msg);
      return;
    }

    try {
      console.log(
        `[Canvas Sync] Processing Canvas grade job for submission ${job.submissionId}.`
      );
      await handler(job);
      channel.ack(msg);
    } catch (error) {
      const retryable = error?.retryable !== false;
      if (retryable) {
        console.warn(
          `Canvas grade job ${job.submissionId} failed; requeueing`,
          error
        );
        channel.nack(msg, false, true);
      } else {
        console.warn(
          `Canvas grade job ${job.submissionId} failed permanently`,
          error
        );
        channel.ack(msg);
      }
    }
  });
};
