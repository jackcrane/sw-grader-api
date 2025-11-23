import { prisma } from "#prisma";

const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;
const FEATURE_BENCH_FALLBACK_URL = "https://featurebench.com";

const normalizeApiPrefix = (value) => {
  if (!value || typeof value !== "string") return "/api/v1";
  let trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    trimmed = `/${trimmed}`;
  }
  return trimmed.replace(/\/+$/, "");
};

const CANVAS_API_PREFIX = normalizeApiPrefix(process.env.CANVAS_API_PREFIX);

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
};

const sanitizePath = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.startsWith("/") ? value : `/${value}`;
};

const buildCanvasApiUrl = (integration, path) => {
  const base = sanitizeBaseUrl(integration?.instanceUrl);
  if (!base) return "";
  return `${base}${CANVAS_API_PREFIX}${sanitizePath(path)}`;
};

export const getFeatureBenchBaseUrl = () => {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_PUBLIC_URL,
    process.env.APP_URL,
    process.env.APP_BASE_URL,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeBaseUrl(candidate);
    if (sanitized) return sanitized;
  }
  return FEATURE_BENCH_FALLBACK_URL;
};

export const buildFeatureBenchAssignmentUrl = (courseId, assignmentId) => {
  const base = getFeatureBenchBaseUrl();
  if (!courseId || !assignmentId) return base;
  return `${base}/${courseId}/assignments/${assignmentId}`;
};

const escapeHtml = (value) => {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatDescription = (value) => {
  if (!value) return "";
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
};

const buildCanvasAssignmentDescription = (assignment, assignmentUrl) => {
  const sections = [];
  if (assignment?.description) {
    sections.push(`<p>${formatDescription(assignment.description)}</p>`);
  }
  if (assignmentUrl) {
    sections.push(
      `<p><a href="${assignmentUrl}" target="_blank" rel="noopener noreferrer">Open this assignment in FeatureBench</a></p>`
    );
  }
  if (sections.length === 0) {
    sections.push("<p>Complete this assignment in FeatureBench.</p>");
  }
  return sections.join("");
};

const formatCanvasDate = (value) => {
  if (!value) return null;
  const date =
    value instanceof Date || typeof value?.getTime === "function"
      ? value
      : new Date(value);
  if (Number.isNaN(date?.getTime?.())) return null;
  return date.toISOString();
};

const isTokenExpired = (integration) => {
  if (!integration?.tokenExpiresAt) return false;
  const expiry = new Date(integration.tokenExpiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() - TOKEN_EXPIRY_BUFFER_MS <= Date.now();
};

const parseCanvasResponseBody = async (response) => {
  const contentType = response.headers?.get?.("content-type") || "";
  const isJson = contentType.includes("json");
  if (isJson) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text || null;
};

const requestTokenRefresh = async (integration) => {
  if (!integration?.refreshToken) {
    throw new Error("Canvas refresh token is missing.");
  }

  const tokenUrl = `${sanitizeBaseUrl(integration.instanceUrl)}/login/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: integration.refreshToken,
  });

  if (integration.clientId) {
    params.set("client_id", integration.clientId);
  }
  if (integration.clientSecret) {
    params.set("client_secret", integration.clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const body = await parseCanvasResponseBody(response);
  if (!response.ok) {
    const error = new Error(
      body?.error_description ||
        body?.error ||
        "Canvas token refresh failed."
    );
    error.status = response.status;
    error.response = body;
    throw error;
  }

  const expiresIn = Number(body?.expires_in);
  const tokenExpiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

  return {
    accessToken: body?.access_token || null,
    refreshToken: body?.refresh_token || integration.refreshToken,
    tokenExpiresAt,
  };
};

const refreshIntegrationTokens = async (integration) => {
  if (!integration?.refreshToken) return integration;
  const tokens = await requestTokenRefresh(integration);
  if (!tokens?.accessToken) {
    throw new Error("Canvas token refresh response missing access_token.");
  }
  return prisma.canvasIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    },
  });
};

const ensureIntegrationHasValidToken = async (integration) => {
  if (!integration) return null;
  if (
    (!integration.accessToken || isTokenExpired(integration)) &&
    integration.refreshToken
  ) {
    try {
      return await refreshIntegrationTokens(integration);
    } catch (error) {
      console.error(
        `[Canvas] Failed to refresh access token for course ${integration.courseId}`,
        error
      );
      throw error;
    }
  }
  return integration;
};

const canvasApiRequest = async ({ integration, path, method = "GET", body }) => {
  if (!integration) {
    throw new Error("Canvas integration is required.");
  }

  const activeIntegration = await ensureIntegrationHasValidToken(integration);
  if (!activeIntegration?.accessToken) {
    throw new Error("Canvas integration does not have an access token.");
  }

  const execute = async (currentIntegration) => {
    const url = buildCanvasApiUrl(currentIntegration, path);
    if (!url) {
      throw new Error("Canvas API URL could not be determined.");
    }

    const headers = {
      Authorization: `Bearer ${currentIntegration.accessToken}`,
      Accept: "application/json",
    };
    let payload;
    if (body !== undefined) {
      if (typeof body === "string") {
        payload = body;
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      } else {
        payload = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: payload,
    });

    const responseBody = await parseCanvasResponseBody(response);
    if (!response.ok) {
      const error = new Error(
        responseBody?.errors?.[0]?.message ||
          responseBody?.message ||
          responseBody?.error ||
          `Canvas API ${method} ${path} failed.`
      );
      error.status = response.status;
      error.response = responseBody;
      throw error;
    }
    return responseBody;
  };

  try {
    return await execute(activeIntegration);
  } catch (error) {
    if (
      error?.status === 401 &&
      activeIntegration?.refreshToken &&
      activeIntegration?.id
    ) {
      const refreshed = await refreshIntegrationTokens(activeIntegration);
      return execute(refreshed);
    }
    throw error;
  }
};

const buildCanvasAssignmentPayload = ({ assignment, assignmentUrl, publish }) => {
  const payload = {
    name: assignment?.name?.trim() || "FeatureBench Assignment",
    description: buildCanvasAssignmentDescription(assignment, assignmentUrl),
    grading_type: "points",
    points_possible: Number(assignment?.pointsPossible) || 0,
    submission_types: ["external_tool"],
    notify_of_update: false,
    published: Boolean(publish),
    allowed_attempts: -1,
    display_grade_as_points: true,
  };

  if (assignmentUrl) {
    payload.external_tool_tag_attributes = {
      url: assignmentUrl,
      new_tab: true,
    };
  } else {
    payload.submission_types = ["online_upload"];
  }

  const dueAt = formatCanvasDate(assignment?.dueDate);
  if (dueAt) {
    payload.due_at = dueAt;
  }

  return payload;
};

export const getCanvasIntegrationForCourse = async (courseId) => {
  if (!courseId) return null;
  return prisma.canvasIntegration.findUnique({
    where: { courseId },
  });
};

export const postAssignmentToCanvas = async ({
  courseId,
  assignment,
  publish = false,
}) => {
  if (!courseId || !assignment) return null;

  const integration = await getCanvasIntegrationForCourse(courseId);
  if (!integration) return null;

  if (!integration.canvasCourseId) {
    console.warn(
      `[Canvas] Course ${courseId} has no canvasCourseId. Skipping assignment sync.`
    );
    return null;
  }

  if (!integration.instanceUrl) {
    console.warn(
      `[Canvas] Course ${courseId} has no Canvas instance URL. Skipping assignment sync.`
    );
    return null;
  }

  if (!integration.accessToken && !integration.refreshToken) {
    console.warn(
      `[Canvas] Course ${courseId} has no Canvas tokens. Skipping assignment sync.`
    );
    return null;
  }

  const assignmentUrl = buildFeatureBenchAssignmentUrl(
    courseId,
    assignment.id
  );
  const payload = {
    assignment: buildCanvasAssignmentPayload({
      assignment,
      assignmentUrl,
      publish,
    }),
  };

  const path = `/courses/${encodeURIComponent(
    integration.canvasCourseId
  )}/assignments`;

  const result = await canvasApiRequest({
    integration,
    path,
    method: "POST",
    body: payload,
  });

  console.log(
    `[Canvas] Posted assignment ${assignment.id} to Canvas course ${integration.canvasCourseId} (FeatureBench course ${courseId}).`
  );

  return result;
};
