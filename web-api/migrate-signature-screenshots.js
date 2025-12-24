#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const [
  { prisma },
  { uploadObject, buildPublicUrl, isS3Configured },
  { buildSignatureAssetKey },
] = await Promise.all([
  import("./util/prisma.js"),
  import("./util/s3.js"),
  import("./services/submissionUtils.js"),
]);

const BATCH_SIZE = Number(process.env.SCREENSHOT_MIGRATION_BATCH || 25);

const normalizeBase64Image = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dataUriMatch = trimmed.match(/^data:(.+);base64,(.+)$/i);
  const [, mimeType = "image/png", payload = trimmed] = dataUriMatch || [];
  const base64Payload = dataUriMatch ? payload : trimmed;
  try {
    const buffer = Buffer.from(base64Payload, "base64");
    if (buffer.length === 0) return null;
    return { buffer, contentType: mimeType || "image/png" };
  } catch (error) {
    console.warn("Failed to decode screenshot base64", error?.message || error);
    return null;
  }
};

if (!isS3Configured) {
  console.error("S3 is not configured. Aborting screenshot migration.");
  process.exit(1);
}

const whereClause = {
  deleted: false,
  screenshotB64: {
    not: null,
  },
  OR: [
    { screenshotKey: null },
    { screenshotKey: "" },
  ],
};

const totalPending = await prisma.assignmentSignature.count({
  where: whereClause,
});

if (totalPending === 0) {
  console.log("No assignment signatures require screenshot migration.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Migrating ${totalPending} assignment signature screenshots...`);

let migrated = 0;
let cursorId = null;

while (true) {
  const batch = await prisma.assignmentSignature.findMany({
    where: whereClause,
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      assignmentId: true,
      screenshotB64: true,
      screenshotKey: true,
      screenshotUrl: true,
    },
  });

  if (batch.length === 0) break;

  for (const signature of batch) {
    cursorId = signature.id;
    try {
      const decoded = normalizeBase64Image(signature.screenshotB64);
      if (!decoded) {
        console.warn(
          `Skipping signature ${signature.id}; base64 screenshot is invalid.`
        );
        continue;
      }
      const targetKey = buildSignatureAssetKey({
        assignmentId: signature.assignmentId,
        signatureId: signature.id,
        extension: ".png",
      });
      const upload = await uploadObject({
        key: targetKey,
        body: decoded.buffer,
        contentType: decoded.contentType,
      });
      await prisma.assignmentSignature.update({
        where: { id: signature.id },
        data: {
          screenshotKey: upload.key,
          screenshotUrl: upload.url || buildPublicUrl(upload.key),
        },
      });
      migrated += 1;
      console.log(
        `Migrated signature ${signature.id} (${migrated}/${totalPending})`
      );
    } catch (error) {
      console.error(
        `Failed to migrate screenshot for signature ${signature.id}`,
        error?.message || error
      );
    }
  }
}

console.log(
  `Screenshot migration complete. ${migrated}/${totalPending} signatures updated.`
);
await prisma.$disconnect();
