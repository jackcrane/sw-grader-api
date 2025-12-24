import dotenv from "dotenv";
dotenv.config();
import {
  bufferFromBase64,
  buildSignatureAssetKey,
} from "../services/submissionUtils.js";
import { uploadObject, buildPublicUrl, getSignedDownloadUrl } from "./s3.js";
import { ValidationError } from "../routes/courses/[courseId]/assignments/validation.js";

const ensureSingleSignatureScreenshot = async ({
  assignmentId,
  signature,
  existingSignature,
  index,
}) => {
  const screenshotB64 = signature?.screenshotB64?.trim() || null;
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
    signature.screenshotUrl =
      upload?.url ?? buildPublicUrl(signature.screenshotKey);
    signature.screenshotB64 = null;
    return;
  }

  if (signature?.screenshotKey) {
    signature.screenshotUrl =
      existingSignature?.screenshotUrl ??
      buildPublicUrl(signature.screenshotKey);
    signature.screenshotB64 = null;
    return;
  }

  if (existingSignature?.screenshotKey) {
    signature.screenshotKey = existingSignature.screenshotKey;
    signature.screenshotUrl = existingSignature.screenshotUrl;
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
