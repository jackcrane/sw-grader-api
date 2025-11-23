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

const buildResultXml = ({
  resultSourcedId,
  normalizedScore,
  grade,
  pointsPossible,
}) => {
  const score = normalizedScore ?? 0;
  const scoreText = Number(score).toFixed(5);
  const gradeLabel =
    Number.isFinite(grade) && Number.isFinite(pointsPossible)
      ? `${grade}/${pointsPossible}`
      : grade ?? "0";
  const messageIdentifier = `featurebench-${Date.now()}-${crypto.randomUUID()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/lis/oms1p0/pox">\n  <imsx_POXHeader>\n    <imsx_POXRequestHeaderInfo>\n      <imsx_version>V1.0</imsx_version>\n      <imsx_messageIdentifier>${messageIdentifier}</imsx_messageIdentifier>\n    </imsx_POXRequestHeaderInfo>\n  </imsx_POXHeader>\n  <imsx_POXBody>\n    <replaceResultRequest>\n      <resultRecord>\n        <sourcedGUID>\n          <sourcedId>${resultSourcedId}</sourcedId>\n        </sourcedGUID>\n        <result>\n          <resultScore>\n            <language>en</language>\n            <textString>${scoreText}</textString>\n          </resultScore>\n          <resultData>\n            <textString>${gradeLabel}</textString>\n          </resultData>\n        </result>\n      </resultRecord>\n    </replaceResultRequest>\n  </imsx_POXBody>\n</imsx_POXEnvelopeRequest>`;
};

const buildOAuthHeader = ({
  url,
  body,
  consumerKey,
  consumerSecret,
}) => {
  if (!consumerKey || !consumerSecret) {
    throw Object.assign(new Error("Canvas consumer credentials missing."), {
      retryable: false,
    });
  }
  const parsedUrl = new URL(url);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
  const parameters = [];
  parsedUrl.searchParams.forEach((value, key) => {
    parameters.push([key, value]);
  });
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    oauth_body_hash: crypto
      .createHash("sha1")
      .update(body)
      .digest("base64"),
  };
  Object.entries(oauthParams).forEach(([key, value]) => {
    parameters.push([key, value]);
  });
  const sorted = parameters.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    }
    return a[0] < b[0] ? -1 : 1;
  });
  const parameterString = sorted
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const baseString = [
    "POST",
    percentEncode(baseUrl),
    percentEncode(parameterString),
  ].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&`;
  const oauthSignature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");
  const finalParams = {
    ...oauthParams,
    oauth_signature: oauthSignature,
  };
  const headerValue =
    "OAuth " +
    Object.entries(finalParams)
      .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
      .join(", ");
  return headerValue;
};

const sendCanvasOutcomeRequest = async ({
  outcomeUrl,
  body,
  consumerKey,
  consumerSecret,
}) => {
  const authorization = buildOAuthHeader({
    url: outcomeUrl,
    body,
    consumerKey,
    consumerSecret,
  });

  const response = await fetch(outcomeUrl, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/xml",
    },
    body,
  });

  const responseText = await response.text();
  const success =
    response.ok && /<imsx_codeMajor>\s*success\s*<\/imsx_codeMajor>/i.test(responseText);
  if (!success) {
    const error = new Error(
      response.ok
        ? "Canvas outcome service responded with failure."
        : `Canvas outcome service HTTP ${response.status}`
    );
    error.response = truncate(responseText, 500);
    error.status = response.status;
    error.retryable = !response.ok && response.status >= 500;
    throw error;
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
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Submission no longer available.",
    });
  }

  if (submission.grade == null) {
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Submission has no grade to sync.",
    });
  }

  const courseId = submission.assignment?.courseId;
  if (!courseId) {
    return markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "SKIPPED",
      canvasGradeSyncError: "Assignment is missing course context.",
    });
  }

  const integration = await prisma.canvasIntegration.findUnique({
    where: { courseId },
  });
  if (!integration || !integration.clientId || !integration.clientSecret) {
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
  } catch (error) {
    const message =
      truncate(error?.response) || truncate(error?.message) ||
      "Canvas grade sync failed.";
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "FAILED",
      canvasGradeSyncError: message,
    });
    const shouldRetry =
      (error?.retryable !== false && attemptNumber < MAX_ATTEMPTS) || false;
    const failure = new Error(message);
    failure.retryable = shouldRetry;
    throw failure;
  }
};

export const scheduleCanvasGradeSync = async (submissionId) => {
  if (!submissionId) return;
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
    return;
  }

  const courseId = submission.assignment?.courseId;
  if (!courseId) {
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
    submission.canvasOutcomeServiceUrl || launch?.canvasOutcomeServiceUrl || null;

  if (!resultSourcedId || !outcomeUrl) {
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
  } catch (error) {
    await markSubmissionState(submissionId, {
      canvasGradeSyncStatus: "FAILED",
      canvasGradeSyncError: truncate(error?.message) || "Failed to queue Canvas sync.",
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
  consumeCanvasGradeJobs(async (job) => {
    await processCanvasGradeJob(job);
  }).catch((error) => {
    workerStarted = false;
    console.error("Canvas grade worker crashed", error);
  });
};
