import crypto from "node:crypto";
import { prisma } from "#prisma";
import {
  enqueueCanvasGradeJob,
  consumeCanvasGradeJobs,
} from "./canvasGradeQueue.js";

const MAX_ATTEMPTS = Number(process.env.CANVAS_GRADE_MAX_ATTEMPTS || 5);

const percentEncode = (value) =>
  encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

const truncate = (value, length = 400) => {
  if (!value) return null;
  const str = String(value);
  if (str.length <= length) return str;
  return `${str.slice(0, length - 3)}...`;
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildResultXml = ({
  resultSourcedId,
  normalizedScore,
  grade,
  pointsPossible,
}) => {
  const score = normalizedScore ?? 0;
  const scoreText = escapeXml(Number(score).toFixed(5));
  const gradeLabel =
    Number.isFinite(grade) && Number.isFinite(pointsPossible)
      ? `${grade}/${pointsPossible}`
      : String(grade ?? "0");
  const safeGradeLabel = gradeLabel ? escapeXml(gradeLabel) : null;

  const messageIdentifier = `featurebench-${Date.now()}-${crypto.randomUUID()}`;
  const safeMessageId = escapeXml(messageIdentifier);
  const safeSourcedId = escapeXml(resultSourcedId);

  const resultDataXml = safeGradeLabel
    ? `
          <resultData>
            <text>${safeGradeLabel}</text>
          </resultData>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${safeMessageId}</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>${safeSourcedId}</sourcedId>
        </sourcedGUID>
        <result>
          <resultScore>
            <language>en</language>
            <textString>${scoreText}</textString>
          </resultScore>
          ${resultDataXml}
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>`;
};

const buildOAuthHeader = ({ url, body, consumerKey, consumerSecret }) => {
  const parsedUrl = new URL(url);
  const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

  // EXACT BODY HASH used by Canvas
  const oauth_body_hash = crypto
    .createHash("sha1")
    .update(Buffer.from(body, "utf8"))
    .digest("base64");

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    oauth_body_hash,
  };

  // collect ALL params for signature (Canvas requires this)
  const params = [];

  // query params
  parsedUrl.searchParams.forEach((value, key) => {
    params.push([key, value]);
  });

  // OAuth params
  Object.entries(oauthParams).forEach(([key, value]) => {
    params.push([key, value]);
  });

  // sort (OAuth spec)
  params.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    }
    return aKey < bKey ? -1 : 1;
  });

  const parameterString = params
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const baseString = [
    "POST",
    percentEncode(baseUrl),
    percentEncode(parameterString),
  ].join("&");

  const signingKey = `${percentEncode(consumerSecret)}&`;

  const oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  // DO NOT percent-encode oauth_body_hash
  const authorizationHeader =
    `OAuth realm="", ` +
    Object.entries({ ...oauthParams, oauth_signature })
      .map(([key, value]) => {
        if (key === "oauth_body_hash") {
          return `${key}="${value}"`;
        }
        return `${key}="${percentEncode(value)}"`;
      })
      .join(", ");

  return authorizationHeader;
};

const sendCanvasOutcomeRequest = async ({
  outcomeUrl,
  body,
  consumerKey,
  consumerSecret,
}) => {
  const auth = buildOAuthHeader({
    url: outcomeUrl,
    body,
    consumerKey,
    consumerSecret,
  });

  const response = await fetch(outcomeUrl, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/xml",
    },
    body: Buffer.from(body, "utf8"), // critical
  });

  const text = await response.text();

  const ok =
    response.ok &&
    /<imsx_codeMajor>\s*success\s*<\/imsx_codeMajor>/i.test(text);

  if (!ok) {
    console.log("[Canvas Sync] Canvas grade sync failed.", {
      outcomeUrl,
      auth,
      body,
      response: text,
    });

    console.log(response.status, response.statusText);

    const err = new Error(
      response.ok
        ? "Canvas outcome service responded with failure."
        : `HTTP ${response.status}`
    );
    err.response = truncate(text);
    err.status = response.status;
    err.retryable = response.status >= 500;
    throw err;
  }
};

const findCanvasLaunchMetadata = async ({ assignmentId, userId }) => {
  if (!assignmentId || !userId) return null;
  return prisma.canvasAssignmentLaunch.findFirst({
    where: {
      assignmentId,
      userId,
      canvasResultSourcedId: {
        not: null,
      },
      canvasOutcomeServiceUrl: {
        not: null,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      canvasResultSourcedId: true,
      canvasOutcomeServiceUrl: true,
    },
  });
};

const markSubmissionState = async (submissionId, data) => {
  if (!submissionId) return null;
  try {
    return await prisma.submission.update({
      where: { id: submissionId },
      data,
    });
  } catch (error) {
    console.warn(
      `Failed to update Canvas sync state for submission ${submissionId}`,
      error
    );
    return null;
  }
};

const buildNormalizedScore = (grade, pointsPossible) => {
  const numericGrade = Number(grade);
  if (!Number.isFinite(numericGrade)) return null;
  const numericPoints = Number(pointsPossible);
  if (Number.isFinite(numericPoints) && numericPoints > 0) {
    const ratio = numericGrade / numericPoints;
    return Math.min(Math.max(ratio, 0), 1);
  }
  const normalized = numericGrade / 100;
  return Math.min(Math.max(normalized, 0), 1);
};

const processCanvasGradeJob = async ({ submissionId }) => {
  console.log(`[Canvas Sync] Worker processing submission ${submissionId}.`);
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, deleted: false },
    include: {
      assignment: {
        select: {
          id: true,
          courseId: true,
          pointsPossible: true,
        },
      },
    },
  });
  if (!submission) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} missing when worker ran; skipping.`
    );
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Submission no longer available.",
    });
  }

  if (submission.grade == null) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} no longer graded; skipping.`
    );
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Submission has no grade to sync.",
    });
  }

  const courseId = submission.assignment?.courseId;
  if (!courseId) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} missing course context during worker run.`
    );
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Assignment is missing course context.",
    });
  }

  const integration = await prisma.canvasIntegration.findUnique({
    where: { courseId },
  });
  if (!integration || !integration.clientId || !integration.clientSecret) {
    console.warn(
      `[Canvas Sync] Course ${courseId} still missing Canvas credentials for submission ${submissionId}.`
    );
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Canvas integration is not configured.",
    });
  }

  let resultSourcedId = submission.canvasResultSourcedId;
  let outcomeUrl = submission.canvasOutcomeServiceUrl;
  if (!resultSourcedId || !outcomeUrl) {
    const launch = await findCanvasLaunchMetadata({
      assignmentId: submission.assignmentId,
      userId: submission.userId,
    });
    if (launch) {
      resultSourcedId = launch.canvasResultSourcedId;
      outcomeUrl = launch.canvasOutcomeServiceUrl;
      await markSubmissionState(submissionId, {
        canvasResultSourcedId: resultSourcedId,
        canvasOutcomeServiceUrl: outcomeUrl,
      });
    }
  }

  if (!resultSourcedId || !outcomeUrl) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} lacks Canvas launch metadata during worker run.`
    );
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Canvas launch metadata not found.",
    });
  }

  const attemptNumber = (submission.canvasGradeSyncAttempts ?? 0) + 1;
  await markSubmissionState(submissionId, {
    canvasGradeSyncStatus: "SYNCING",
    canvasGradeSyncLastAttemptAt: new Date(),
    canvasGradeSyncAttempts: {
      increment: 1,
    },
    canvasGradeSyncError: null,
  });

  const normalizedScore = buildNormalizedScore(
    submission.grade,
    submission.assignment?.pointsPossible
  );
  const body = buildResultXml({
    resultSourcedId,
    normalizedScore,
    grade: submission.grade,
    pointsPossible: submission.assignment?.pointsPossible ?? null,
  });

  try {
    await sendCanvasOutcomeRequest({
      outcomeUrl,
      body,
      consumerKey: integration.clientId,
      consumerSecret: integration.clientSecret,
    });
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SUCCESS",
      canvasGradeSyncedAt: new Date(),
      canvasGradeSyncError: null,
    });
    console.log(
      `[Canvas Sync] Submission ${submissionId} successfully synced to Canvas.`
    );
  } catch (error) {
    const message =
      truncate(error?.response) ||
      truncate(error?.message) ||
      "Canvas grade sync failed.";
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "FAILED",
      canvasGradeSyncError: message,
    });
    console.warn(
      `[Canvas Sync] Submission ${submissionId} failed to sync to Canvas: ${message}`,
      error
    );
    const shouldRetry =
      (error?.retryable !== false && attemptNumber < MAX_ATTEMPTS) || false;
    const failure = new Error(message);
    failure.retryable = shouldRetry;
    throw failure;
  }
};

export const scheduleCanvasGradeSync = async (submissionId) => {
  if (!submissionId) return;
  console.log(
    `[Canvas Sync] Scheduling submission ${submissionId} for Canvas grade passback.`
  );
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, deleted: false },
    include: {
      assignment: {
        select: {
          id: true,
          courseId: true,
        },
      },
    },
  });
  if (!submission || submission.grade == null) {
    console.log(
      `[Canvas Sync] Submission ${submissionId} missing data or not graded; skipping schedule.`
    );
    return;
  }

  const courseId = submission.assignment?.courseId;
  if (!courseId) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} missing course context; marking as skipped.`
    );
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Assignment is missing course context.",
    });
    return;
  }

  const integration = await prisma.canvasIntegration.findUnique({
    where: { courseId },
  });
  if (!integration || !integration.clientId || !integration.clientSecret) {
    console.warn(
      `[Canvas Sync] Course ${courseId} missing Canvas credentials; cannot sync submission ${submissionId}.`
    );
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Canvas integration is not configured.",
    });
    return;
  }

  const launch = await findCanvasLaunchMetadata({
    assignmentId: submission.assignmentId,
    userId: submission.userId,
  });
  const resultSourcedId =
    submission.canvasResultSourcedId || launch?.canvasResultSourcedId || null;
  const outcomeUrl =
    submission.canvasOutcomeServiceUrl ||
    launch?.canvasOutcomeServiceUrl ||
    null;

  if (!resultSourcedId || !outcomeUrl) {
    console.warn(
      `[Canvas Sync] Submission ${submissionId} missing Canvas outcome metadata; skipping.`
    );
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Canvas launch metadata not found.",
      canvasResultSourcedId: resultSourcedId,
      canvasOutcomeServiceUrl: outcomeUrl,
    });
    return;
  }

  const queuedAt = new Date();
  await markSubmissionState(submissionId, {
    canvasGradeSyncStatus: "PENDING",
    canvasGradeSyncedAt: null,
    canvasGradeSyncQueuedAt: queuedAt,
    canvasGradeSyncError: null,
    canvasGradeSyncAttempts: 0,
    canvasResultSourcedId: resultSourcedId,
    canvasOutcomeServiceUrl: outcomeUrl,
  });

  try {
    await enqueueCanvasGradeJob({ submissionId });
    console.log(
      `[Canvas Sync] Submission ${submissionId} queued for Canvas grade worker.`
    );
  } catch (error) {
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "FAILED",
      canvasGradeSyncError:
        truncate(error?.message) || "Failed to queue Canvas sync.",
    });
    console.warn(
      `Failed to enqueue Canvas grade sync for submission ${submissionId}`,
      error
    );
  }
};

let workerStarted = false;

export const startCanvasGradePassbackWorker = async () => {
  if (workerStarted) return;
  workerStarted = true;
  console.log("[Canvas Sync] Starting Canvas grade passback worker.");
  consumeCanvasGradeJobs(async (job) => {
    await processCanvasGradeJob(job);
  }).catch((error) => {
    workerStarted = false;
    console.error("Canvas grade worker crashed", error);
  });
};
