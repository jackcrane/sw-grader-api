import amqplib from "amqplib";
import dotenv from "dotenv";
dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL;
if (!RABBITMQ_URL) {
  throw new Error("RABBITMQ_URL is not configured");
}
const BILLING_QUEUE_NAME =
  process.env.BILLING_FOLLOW_UP_QUEUE || "billing.followups";
const BILLING_DELAY_QUEUE_NAME = `${BILLING_QUEUE_NAME}.delay`;
const BILLING_EXCHANGE_NAME = `${BILLING_QUEUE_NAME}.exchange`;
let connectionPromise = null;
let publishChannelPromise = null;
let consumeChannelPromise = null;

const attachConnectionHandlers = (connection) => {
  connection.on("close", () => {
    console.warn("Billing queue connection closed. Reinitializing on demand.");
    connectionPromise = null;
    publishChannelPromise = null;
    consumeChannelPromise = null;
  });
  connection.on("error", (error) => {
    console.warn("Billing queue connection error", error?.message || error);
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
        console.error("Failed to connect to RabbitMQ for billing queue", error);
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
    console.warn(
      `Billing queue ${type} channel error`,
      error?.message || error
    );
  });
  return channel;
};

const setupQueues = async (channel) => {
  await channel.assertExchange(BILLING_EXCHANGE_NAME, "direct", {
    durable: true,
  });
  await channel.assertQueue(BILLING_QUEUE_NAME, { durable: true });
  await channel.bindQueue(
    BILLING_QUEUE_NAME,
    BILLING_EXCHANGE_NAME,
    BILLING_QUEUE_NAME
  );
  await channel.assertQueue(BILLING_DELAY_QUEUE_NAME, {
    durable: true,
    deadLetterExchange: BILLING_EXCHANGE_NAME,
    deadLetterRoutingKey: BILLING_QUEUE_NAME,
  });
};

const getPublishChannel = async () => {
  if (!publishChannelPromise) {
    publishChannelPromise = getConnection()
      .then(async (connection) => {
        const channel = await connection.createConfirmChannel();
        await setupQueues(channel);
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
        await setupQueues(channel);
        return attachChannelHandlers(channel, "consume");
      })
      .catch((error) => {
        consumeChannelPromise = null;
        throw error;
      });
  }
  return consumeChannelPromise;
};

const parseJobMessage = (msg) => {
  if (!msg?.content) return null;
  try {
    return JSON.parse(msg.content.toString());
  } catch {
    return null;
  }
};

export const enqueueBillingJob = async (payload, { delayMs = 0 } = {}) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("enqueueBillingJob requires a payload object.");
  }
  const channel = await getPublishChannel();
  const options = {
    persistent: true,
    contentType: "application/json",
  };
  const normalizedDelay =
    typeof delayMs === "number" && delayMs > 0 ? Math.round(delayMs) : 0;
  const targetQueue =
    normalizedDelay > 0 ? BILLING_DELAY_QUEUE_NAME : BILLING_QUEUE_NAME;
  if (normalizedDelay > 0) {
    options.expiration = String(normalizedDelay);
  }
  channel.sendToQueue(
    targetQueue,
    Buffer.from(JSON.stringify(payload)),
    options
  );
  await channel.waitForConfirms();
};

export const consumeBillingJobs = async (handler) => {
  if (typeof handler !== "function") {
    throw new Error("consumeBillingJobs requires a handler function.");
  }
  const channel = await getConsumerChannel();
  await channel.prefetch(5);
  await channel.consume(BILLING_QUEUE_NAME, async (msg) => {
    if (!msg) return;
    const job = parseJobMessage(msg);
    if (!job) {
      console.warn("Skipping malformed billing job", msg?.content?.toString());
      channel.ack(msg);
      return;
    }

    try {
      await handler(job);
      channel.ack(msg);
    } catch (error) {
      console.error("Billing job failed; requeueing", error);
      channel.nack(msg, false, true);
    }
  });
};
