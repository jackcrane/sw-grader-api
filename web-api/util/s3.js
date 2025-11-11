import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const requiredEnv = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_BUCKET",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(
    `Missing required S3 environment variables: ${missingEnv.join(", ")}`
  );
}

const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.AWS_ENDPOINT;
const acl = process.env.AWS_ACL || undefined;
const forcePathStyle = String(process.env.AWS_FORCE_PATH_STYLE).toLowerCase() === "true";

const hasCredentials =
  bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

const client = hasCredentials
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

const baseUrl = (() => {
  const override = process.env.AWS_PUBLIC_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  if (endpoint && bucket) {
    try {
      const endpointUrl = new URL(endpoint);
      return `${endpointUrl.protocol}//${bucket}.${endpointUrl.host}`;
    } catch {
      // ignore, fall through to AWS default
    }
  }
  if (bucket) {
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }
  return null;
})();

export const isS3Configured = Boolean(client && bucket);

const encodeKeyForUrl = (key) =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const buildPublicUrl = (key) => {
  if (!key || !baseUrl) return null;
  return `${baseUrl}/${encodeKeyForUrl(key)}`;
};

export const uploadObject = async ({
  key,
  body,
  contentType,
  cacheControl,
  metadata,
}) => {
  if (!client || !bucket) {
    throw new Error("S3 client is not configured.");
  }
  if (!key || !body) {
    throw new Error("S3 uploads require both a key and body.");
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
    Metadata: metadata,
    ACL: acl,
  });

  await client.send(command);

  return {
    key,
    url: buildPublicUrl(key),
  };
};

export const downloadObject = async (key) => {
  if (!client || !bucket) {
    throw new Error("S3 client is not configured.");
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

export const getSignedDownloadUrl = async (
  key,
  { expiresInSeconds = 900, responseDisposition } = {}
) => {
  if (!isS3Configured || !key) return null;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: responseDisposition,
  });
  try {
    return await getSignedUrl(client, command, {
      expiresIn: expiresInSeconds,
    });
  } catch (error) {
    console.warn("Failed to generate signed URL", error);
    return null;
  }
};
