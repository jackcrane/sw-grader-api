import dotenv from "dotenv";
dotenv.config();
import {
  bufferFromBase64,
  buildSignatureAssetKey,
} from "../services/submissionUtils.js";
import { uploadObject, buildPublicUrl, getSignedDownloadUrl } from "./s3.js";
import { ValidationError } from "../routes/courses/[courseId]/assignments/validation.js";

const normalizeOptionalString = (value) =>
  typeof value === "string" ? value.trim() || null : null;

const stripUrlQueryAndHash = (value) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  try {
    const parsed = new URL(normalized);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    const [withoutQuery] = normalized.split("?");
    return withoutQuery || null;
  }
};

const extractKeyFromUrl = (value) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const trimmedPath = (parsed.pathname || "").replace(/^\/+/, "");
    return trimmedPath ? decodeURIComponent(trimmedPath) : null;
  } catch {
    const trimmed = normalized.replace(/^\/+/, "");
    return trimmed || null;
  }
};

const resolveScreenshotUrlForKey = ({
  key,
  uploadUrl = null,
  payloadUrl = null,
  existingUrl = null,
}) => {
  if (!key) return null;
  const candidates = [
    stripUrlQueryAndHash(uploadUrl),
    stripUrlQueryAndHash(existingUrl),
    stripUrlQueryAndHash(payloadUrl),
  ];
  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }
  return buildPublicUrl(key) ?? null;
};

const ensureSingleSignatureScreenshot = async ({
  assignmentId,
  signature,
  existingSignature,
  index,
}) => {
  const screenshotB64 = normalizeOptionalString(signature?.screenshotB64);
  const screenshotUrlValue = normalizeOptionalString(signature?.screenshotUrl);
  const requestedKey = normalizeOptionalString(signature?.screenshotKey);
  const inferredKey = extractKeyFromUrl(screenshotUrlValue);
  const existingKey = normalizeOptionalString(existingSignature?.screenshotKey);
  const existingUrl = normalizeOptionalString(existingSignature?.screenshotUrl);

  if (screenshotB64) {
    const buffer = bufferFromBase64(screenshotB64);
    if (!buffer) {
      throw new ValidationError(
        `Signature ${index + 1} has invalid screenshot data.`
      );
    }
    const targetKey =
      existingSignature?.screenshotKey ??
      buildSignatureAssetKey({
        assignmentId,
        signatureId: signature.id ?? undefined,
        extension: ".png",
      });
    const upload = await uploadObject({
      key: targetKey,
      body: buffer,
      contentType: "image/png",
    });
    signature.screenshotKey = upload?.key ?? targetKey;
    signature.screenshotUrl = resolveScreenshotUrlForKey({
      key: signature.screenshotKey,
      uploadUrl: upload?.url,
      payloadUrl: screenshotUrlValue,
      existingUrl,
    });
    signature.screenshotB64 = null;
    return;
  }

  const resolvedKey = requestedKey ?? inferredKey ?? null;
  if (resolvedKey) {
    signature.screenshotKey = resolvedKey;
    signature.screenshotUrl = resolveScreenshotUrlForKey({
      key: resolvedKey,
      payloadUrl: screenshotUrlValue,
      existingUrl,
    });
    signature.screenshotB64 = null;
    return;
  }

  if (existingKey) {
    signature.screenshotKey = existingKey;
    signature.screenshotUrl = resolveScreenshotUrlForKey({
      key: existingKey,
      existingUrl,
    });
    signature.screenshotB64 = null;
    return;
  }

  signature.screenshotKey = null;
  signature.screenshotUrl = null;
  signature.screenshotB64 = null;
};

export const ensureSignatureScreenshotAssets = async ({
  assignmentId,
  signatures = [],
  existingSignatures = [],
}) => {
  const existingMap = new Map(
    existingSignatures
      .filter((signature) => signature?.id)
      .map((signature) => [signature.id, signature])
  );

  await Promise.all(
    signatures.map((signature, index) =>
      ensureSingleSignatureScreenshot({
        assignmentId,
        signature,
        existingSignature: signature.id ? existingMap.get(signature.id) : null,
        index,
      })
    )
  );
};

export const withSignedSignatureScreenshots = async (assignment) => {
  if (!assignment?.signatures || assignment.signatures.length === 0) {
    return assignment;
  }
  const signedSignatures = await Promise.all(
    assignment.signatures.map(async (signature) => {
      if (!signature?.screenshotKey) return signature;
      const signedUrl = await getSignedDownloadUrl(signature.screenshotKey, {
        responseDisposition: "inline",
      });
      return {
        ...signature,
        screenshotUrl: signedUrl || signature.screenshotUrl,
      };
    })
  );
  return {
    ...assignment,
    signatures: signedSignatures,
  };
};
