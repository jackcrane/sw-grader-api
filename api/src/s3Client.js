import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const requiredEnv = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_BUCKET",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(
    `Grader worker missing S3 env vars: ${missingEnv.join(", ")}`
  );
}

const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.AWS_ENDPOINT;
const forcePathStyle =
  String(process.env.AWS_FORCE_PATH_STYLE).toLowerCase() === "true";

const client =
  bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region,
        endpoint: endpoint || undefined,
        forcePathStyle,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

export const downloadObject = async (key) => {
  if (!client || !bucket) {
    throw new Error("S3 client is not configured for the grader.");
  }
  if (!key) {
    throw new Error("S3 download requires a key.");
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const response = await client.send(command);
  if (!response.Body) return null;

  if (typeof response.Body.transformToByteArray === "function") {
    const arrayBuffer = await response.Body.transformToByteArray();
    return Buffer.from(arrayBuffer);
  }

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};
