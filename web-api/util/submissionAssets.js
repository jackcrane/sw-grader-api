import { getSignedDownloadUrl } from "./s3.js";

const extractFileNameFromKey = (key) => {
  if (!key) return null;
  const segments = key.split("/");
  return segments[segments.length - 1] || null;
};

const sanitizeDispositionFilename = (value) => {
  if (!value) return null;
  return value.replace(/["\r\n]/g, "").trim() || null;
};

export const withSignedAssetUrls = async (submission) => {
  if (!submission) return submission;

  const preferredFileName = sanitizeDispositionFilename(
    submission.fileName?.trim() || extractFileNameFromKey(submission.fileKey)
  );
  const [fileUrl, screenshotUrl] = await Promise.all([
    getSignedDownloadUrl(submission.fileKey, {
      responseDisposition: preferredFileName
        ? `attachment; filename="${preferredFileName}"`
        : undefined,
    }),
    getSignedDownloadUrl(submission.screenshotKey, {
      responseDisposition: "inline",
    }),
  ]);

  return {
    ...submission,
    fileUrl: fileUrl || submission.fileUrl,
    screenshotUrl: screenshotUrl || submission.screenshotUrl,
  };
};

export const withSignedAssetUrlsMany = async (submissions = []) => {
  return Promise.all(submissions.map((submission) => withSignedAssetUrls(submission)));
};
