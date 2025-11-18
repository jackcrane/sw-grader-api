import amqplib from "amqplib";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://db.jackcrane.rocks";
const GRADER_QUEUE_NAME =
  process.env.GRADER_QUEUE_NAME || "grader.submissions";

const parseMessage = (msg) => {
  if (!msg?.content) return null;
  try {
    return JSON.parse(msg.content.toString());
  } catch (error) {
    console.warn("Failed to parse queue message", error);
    return null;
  }
};

const createChannel = async () => {
  const connection = await amqplib.connect(RABBITMQ_URL);
  connection.on("error", (error) => {
    console.warn("RabbitMQ connection error", error?.message || error);
  });
  connection.on("close", () => {
    console.warn("RabbitMQ connection closed.");
  });
  const channel = await connection.createChannel();
  await channel.assertQueue(GRADER_QUEUE_NAME, { durable: true });
  channel.prefetch(1);
  channel.on("error", (error) => {
    console.warn("RabbitMQ channel error", error?.message || error);
  });
  return { connection, channel };
};

export const startQueueWorker = (handler) => {
  if (typeof handler !== "function") {
    throw new Error("startQueueWorker requires a handler function.");
  }

  const consume = async () => {
    try {
      const { connection, channel } = await createChannel();
      console.log(
        `[queue] Connected to ${RABBITMQ_URL}, listening on ${GRADER_QUEUE_NAME}`
      );
      channel.consume(GRADER_QUEUE_NAME, async (msg) => {
        if (!msg) return;
        const job = parseMessage(msg);
        if (!job?.submissionId || !job?.fileKey) {
          console.warn("Skipping invalid grader message", job);
          channel.ack(msg);
          return;
        }
        try {
          console.log(
            `[queue] Processing submission ${job.submissionId} (unitSystem=${job.unitSystem || "mks"})`
          );
          await handler(job);
          console.log(`[queue] Completed submission ${job.submissionId}`);
          channel.ack(msg);
        } catch (error) {
          console.error(
            `Grader job ${job?.submissionId} failed; requeueing`,
            error
          );
          channel.nack(msg, false, true);
        }
      });

      connection.on("close", () => {
        console.warn("[queue] Connection closed, retrying in 5s");
        setTimeout(consume, 5000);
      });
    } catch (error) {
      console.error("Failed to start grader queue worker", error);
      setTimeout(consume, 5000);
    }
  };

  consume();
};
