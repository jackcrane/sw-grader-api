import express from "express";
import crypto from "crypto";
import { prisma } from "#prisma";
import {
  getSessionCookie,
  loadSessionFromCookie,
} from "../../../util/auth.js";
import { findUserById } from "../../../util/users.js";
import { attachCanvasUserIdToUser } from "./helpers.js";

const urlEncodedParser = express.urlencoded({ extended: false });

const logDeepLinkAttempt = (req) => {
  console.log("[Canvas LTI] Deep Link request headers:", req.headers);
  console.log("[Canvas LTI] Deep Link request body:", req.body);
};

const CANVAS_LAUNCH_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const createLaunchToken = () => crypto.randomBytes(24).toString("hex");

const findCourseByConsumerKey = async (consumerKey) => {
  if (!consumerKey) return null;
  return prisma.course.findFirst({
    where: { id: consumerKey, deleted: false },
    select: { id: true, name: true },
  });
};

const loadUserFromSession = async (req) => {
  try {
    const cookieValue = getSessionCookie(req);
    if (!cookieValue) return null;
    const session = loadSessionFromCookie(cookieValue);
    if (!session?.userId) return null;
    const user = await findUserById(session.userId);
    if (!user || user.deleted) return null;
    return user;
  } catch (error) {
    console.error("[Canvas LTI] Failed to load session user", error);
    return null;
  }
};

const tryParseUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed =
    tryParseUrl(trimmed) ||
    (!trimmed.includes("://") ? tryParseUrl(`https://${trimmed}`) : null);
  if (parsed) {
    return parsed.origin;
  }
  return trimmed.replace(/\/+$/, "");
};

const resolveFeatureBenchBaseUrl = (req) => {
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
  const protoHeader = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(
      ","
    )[0] ||
    req.protocol ||
    "https";
  const host = req.get("host") || "featurebench.com";
  return `${protocol}://${host}`.replace(/\/+$/, "");
};

const buildAssignmentUrlForRequest = (req, courseId, assignmentId) => {
  const base = resolveFeatureBenchBaseUrl(req);
  if (!courseId || !assignmentId) return base;
  return `${base}/${courseId}/assignments/${assignmentId}`;
};

const resolveAssignmentId = (req) => {
  const candidates = [
    req.query?.assignmentId,
    req.body?.featurebench_assignment_id,
    req.body?.custom_featurebench_assignment_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
};

const escapeHtml = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const sanitizeReturnUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (!url.protocol || !url.host) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

const getFeatureBenchCourseUrl = (req, courseId) => {
  const base = resolveFeatureBenchBaseUrl(req);
  if (!courseId) return base;
  return `${base}/${courseId}`;
};

const renderErrorPage = ({ heading, message }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FeatureBench – Canvas setup</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px; }
      main { max-width: 640px; margin: 0 auto; background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; }
      h1 { margin-top: 0; font-size: 2rem; }
      p { line-height: 1.5; font-size: 1rem; }
      a.button { display: inline-flex; margin-top: 16px; padding: 12px 20px; border-radius: 999px; background: #0f172a; color: white; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      <p>If you need help, email <a href="mailto:support@featurebench.com">support@featurebench.com</a>.</p>
    </main>
  </body>
</html>`;

const createCanvasAssignmentLaunch = async ({ assignment, body, user }) => {
  if (!assignment?.id || !assignment?.courseId) {
    throw new Error("Assignment and course are required for Canvas launch.");
  }

  const expiresAt = new Date(Date.now() + CANVAS_LAUNCH_EXPIRY_MS);
  const token = user ? null : createLaunchToken();

  return prisma.canvasAssignmentLaunch.create({
    data: {
      assignmentId: assignment.id,
      courseId: assignment.courseId,
      userId: user?.id ?? null,
      token,
      canvasConsumerKey: body?.oauth_consumer_key || null,
      canvasUserId: body?.user_id || null,
      canvasCourseId:
        body?.custom_canvas_course_id ||
        body?.custom_canvas_root_account_id ||
        body?.context_id ||
        null,
      canvasResultSourcedId: body?.lis_result_sourcedid || null,
      canvasOutcomeServiceUrl: body?.lis_outcome_service_url || null,
      canvasReturnUrl: body?.launch_presentation_return_url || null,
      expiresAt,
      consumedAt: user ? new Date() : null,
    },
  });
};

const buildAssignmentsPage = ({
  course,
  assignments,
  returnUrl,
  consumerKey,
  ltiVersion,
  dataToken,
  courseUrl,
}) => {
  const assignmentsJson = JSON.stringify(assignments).replace(/</g, "\\u003c");
  const dataInput = dataToken
    ? `<input type="hidden" name="data" value="${escapeHtml(dataToken)}" />`
    : "";
  const consumerInput = consumerKey
    ? `<input type="hidden" name="oauth_consumer_key" value="${escapeHtml(
        consumerKey
      )}" />`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Add a FeatureBench assignment</title>
    <style>
      :root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }
      body { margin: 0; padding: 24px; background: #f8fafc; }
      main {
        max-width: 900px;
        margin: 0 auto;
        background: white;
        border-radius: 16px;
        border: 1px solid #e2e8f0;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.1);
      }
      header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
      h1 { margin: 0; font-size: 1.75rem; }
      p { line-height: 1.6; color: #475569; }
      .assignment-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; }
      .assignment-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .assignment-card h3 { margin: 0; font-size: 1.15rem; color: #0f172a; }
      .meta { font-size: 0.95rem; color: #475569; }
      .actions { margin-top: auto; }
      button.assignment-action {
        width: 100%;
        border: none;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        background: #0f172a;
        color: white;
      }
      button.assignment-action[disabled] {
        opacity: 0.65;
        cursor: not-allowed;
      }
      .notice { margin-top: 16px; padding: 12px 16px; border-radius: 12px; background: #f1f5f9; color: #475569; }
      .empty { border: 1px dashed #cbd5f5; border-radius: 12px; padding: 24px; text-align: center; margin-top: 24px; }
      .cta-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 999px;
        background: #0f172a;
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      @media (max-width: 640px) {
        body { padding: 16px; }
        main { padding: 24px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <p style="margin: 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Canvas • FeatureBench</p>
          <h1>Select an assignment</h1>
          <p style="margin-top: 4px;">Choose an existing FeatureBench assignment to attach to Canvas. We'll pass the assignment link and points back to Canvas automatically.</p>
        </div>
        <a class="cta-link" href="${escapeHtml(courseUrl)}" target="_blank" rel="noopener noreferrer">Open FeatureBench</a>
      </header>
      <div class="notice" id="assignment-notice" hidden></div>
      <div class="assignment-list" id="assignment-list"></div>
      <div class="empty" id="assignment-empty" hidden>
        <p style="margin: 0 0 8px; font-weight: 600; color: #0f172a;">No assignments yet</p>
        <p style="margin: 0;">Create an assignment in FeatureBench, then refresh this page or close it and try again from Canvas.</p>
      </div>
      <p style="margin-top: 32px; font-size: 0.9rem; color: #94a3b8;">Having trouble? Email <a href="mailto:support@featurebench.com">support@featurebench.com</a>.</p>
    </main>
    <form id="contentItemForm" method="POST" action="${escapeHtml(
      returnUrl
    )}" style="display:none;">
      <input type="hidden" name="lti_message_type" value="ContentItemSelection" />
      <input type="hidden" name="lti_version" value="${escapeHtml(
        ltiVersion || "LTI-1p0"
      )}" />
      <input type="hidden" name="content_items" />
      ${dataInput}
      ${consumerInput}
    </form>
    <script id="assignment-data" type="application/json">${assignmentsJson}</script>
    <script>
      (() => {
        const dataEl = document.getElementById("assignment-data");
        let assignments = [];
        try {
          assignments = JSON.parse(dataEl?.textContent || "[]");
        } catch (error) {
          console.error("[FeatureBench] Failed to parse assignments", error);
        }
        const form = document.getElementById("contentItemForm");
        const container = document.getElementById("assignment-list");
        const emptyState = document.getElementById("assignment-empty");
        const noticeEl = document.getElementById("assignment-notice");
        const contentItemsField = form.querySelector("input[name=content_items]");
        const courseId = ${JSON.stringify(course?.id || "")};

        const setNotice = (message) => {
          if (!noticeEl) return;
          if (!message) {
            noticeEl.hidden = true;
            noticeEl.textContent = "";
            return;
          }
          noticeEl.hidden = false;
          noticeEl.textContent = message;
        };

        const formatDate = (value) => {
          if (!value) return "Due date not set";
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return "Due date not set";
          return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
        };

        const buildCard = (assignment) => {
          const card = document.createElement("article");
          card.className = "assignment-card";
          const title = document.createElement("h3");
          title.textContent = assignment.name || "Untitled assignment";
          const meta = document.createElement("p");
          meta.className = "meta";
          const points = typeof assignment.pointsPossible === "number" && !Number.isNaN(assignment.pointsPossible)
            ? assignment.pointsPossible
            : 0;
          meta.textContent =
            points +
            " point" +
            (points === 1 ? "" : "s") +
            " • " +
            formatDate(assignment.dueDate);
          const desc = document.createElement("p");
          desc.className = "meta";
          desc.textContent = assignment.description || "This assignment does not include a description.";
          const actions = document.createElement("div");
          actions.className = "actions";
          const button = document.createElement("button");
          button.type = "button";
          button.className = "assignment-action";
          button.textContent = "Add to Canvas";
          button.addEventListener("click", () => handleSelect(assignment, button));
          actions.appendChild(button);
          card.append(title, meta, desc, actions);
          return card;
        };

        const handleSelect = (assignment, button) => {
          if (!assignment || !contentItemsField) return;
          const points = typeof assignment.pointsPossible === "number" && assignment.pointsPossible > 0
            ? assignment.pointsPossible
            : 0;
          const payload = {
            "@context": "http://purl.imsglobal.org/ctx/lti/v1/ContentItem",
            "@graph": [
              {
                "@type": "LtiLinkItem",
                "title": assignment.name || "FeatureBench assignment",
                "text": assignment.description || "Complete this assignment in FeatureBench.",
                "url": assignment.launchUrl,
                "custom": {
                  "featurebench_course_id": courseId,
                  "featurebench_assignment_id": assignment.id,
                },
                "lineItem": {
                  "@type": "LineItem",
                  "label": assignment.name || "FeatureBench assignment",
                  "scoreMaximum": points,
                  "resourceId": assignment.id
                }
              }
            ]
          };
          button.disabled = true;
          button.textContent = "Sending to Canvas...";
          setNotice("Returning this assignment to Canvas. This window will close automatically once Canvas finishes.");
          contentItemsField.value = JSON.stringify(payload);
          form.submit();
        };

        if (!assignments.length) {
          if (emptyState) emptyState.hidden = false;
          setNotice("No assignments were found for this course.");
          return;
        }

        assignments.forEach((assignment) => {
          container.appendChild(buildCard(assignment));
        });
      })();
    </script>
  </body>
</html>`;
};

const handleAssignmentLaunch = async (req, res) => {
  const assignmentId = resolveAssignmentId(req);
  if (!assignmentId) {
    const page = renderErrorPage({
      heading: "Missing FeatureBench assignment",
      message:
        "Add ?assignmentId=FEATUREBENCH_ASSIGNMENT_ID to the external tool URL before using this link in Canvas.",
    });
    return res.status(400).type("text/html").send(page);
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, courseId: true, name: true },
  });

  if (!assignment || !assignment.courseId) {
    const page = renderErrorPage({
      heading: "FeatureBench could not find that assignment",
      message:
        "Verify that the assignment still exists and copy a fresh link from FeatureBench.",
    });
    return res.status(404).type("text/html").send(page);
  }

  const sessionUser = await loadUserFromSession(req);
  console.log(
    `[Canvas LTI] Launching assignment ${assignment.id} (course ${assignment.courseId}) for ${
      sessionUser ? `user ${sessionUser.id}` : "unauthenticated visitor"
    }.`
  );

  const launchRecord = await createCanvasAssignmentLaunch({
    assignment,
    body: req.body || {},
    user: sessionUser,
  });

  if (sessionUser && launchRecord?.canvasUserId) {
    await attachCanvasUserIdToUser(sessionUser.id, launchRecord.canvasUserId);
  }

  const assignmentUrl = buildAssignmentUrlForRequest(
    req,
    assignment.courseId,
    assignment.id
  );
  console.log("[Canvas LTI] Resolved assignment URL:", assignmentUrl);

  if (sessionUser) {
    console.log(
      `[Canvas LTI] Redirecting authenticated user ${sessionUser.id} to ${assignmentUrl}`
    );
    return res.redirect(302, assignmentUrl);
  }

  if (!launchRecord?.token) {
    const page = renderErrorPage({
      heading: "FeatureBench could not continue",
      message:
        "We could not generate a Canvas launch token. Close this window and try launching the assignment again.",
    });
    return res.status(500).type("text/html").send(page);
  }

  const continueUrl = `${resolveFeatureBenchBaseUrl(
    req
  )}/canvas/launch/${launchRecord.token}`;
  console.log(
    `[Canvas LTI] Redirecting unauthenticated Canvas visitor to ${continueUrl} to complete login.`
  );
  return res.redirect(302, continueUrl);
};

const normalizeMessageType = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.replace(/[_\s-]/g, "").toLowerCase();
};

export const post = [
  urlEncodedParser,
  async (req, res) => {
    logDeepLinkAttempt(req);

    const messageType = normalizeMessageType(req.body?.lti_message_type);
    if (messageType === "basicltilaunchrequest") {
      return handleAssignmentLaunch(req, res);
    }

    if (messageType !== "contentitemselectionrequest") {
      const page = renderErrorPage({
        heading: "Unsupported LTI request",
        message:
          "Canvas sent an LTI message we don't recognize. Confirm your configuration or contact support.",
      });
      return res.status(400).type("text/html").send(page);
    }

    const consumerKey = (req.body?.oauth_consumer_key || "").trim();
    if (!consumerKey) {
      const page = renderErrorPage({
        heading: "Missing Consumer Key",
        message: "Canvas did not include an oauth_consumer_key in this request.",
      });
      return res.status(400).type("text/html").send(page);
    }

    const course = await findCourseByConsumerKey(consumerKey);
    if (!course) {
      const page = renderErrorPage({
        heading: "FeatureBench could not match your course",
        message:
          "Double-check the Consumer Key in your Canvas app configuration and try again.",
      });
      return res.status(200).type("text/html").send(page);
    }

    const returnUrl = sanitizeReturnUrl(req.body?.content_item_return_url);
    if (!returnUrl) {
      const page = renderErrorPage({
        heading: "Canvas return URL missing",
        message: "FeatureBench could not determine where to send the selected assignment.",
      });
      return res.status(400).type("text/html").send(page);
    }

    const courseUrl = getFeatureBenchCourseUrl(req, course.id);

    const assignments = await prisma.assignment.findMany({
      where: { courseId: course.id, deleted: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        pointsPossible: true,
        dueDate: true,
        createdAt: true,
      },
    });

    const assignmentsPayload = assignments.map((assignment) => ({
      id: assignment.id,
      name: assignment.name,
      description: assignment.description || "",
      pointsPossible: assignment.pointsPossible || 0,
      dueDate: assignment.dueDate ? assignment.dueDate.toISOString() : null,
      launchUrl: buildAssignmentUrlForRequest(req, course.id, assignment.id),
    }));

    const page = buildAssignmentsPage({
      course,
      courseUrl,
      assignments: assignmentsPayload,
      returnUrl,
      consumerKey,
      ltiVersion: req.body?.lti_version || "LTI-1p0",
      dataToken: typeof req.body?.data === "string" ? req.body.data : "",
    });

    res.status(200).type("text/html").send(page);
  },
];
