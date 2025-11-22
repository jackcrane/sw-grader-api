import express from "express";
import { prisma } from "#prisma";

const urlEncodedParser = express.urlencoded({ extended: false });

const logLaunchAttempt = (req) => {
  console.log("[Canvas LTI] Launch request headers:", req.headers);
  console.log("[Canvas LTI] Launch request body:", req.body);
};

const findCourseByConsumerKey = async (consumerKey) => {
  if (!consumerKey) return null;
  return prisma.course.findFirst({
    where: {
      id: consumerKey,
      deleted: false,
    },
    select: {
      id: true,
      name: true,
    },
  });
};

const sanitizeDomain = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//i, "").split("/")[0];
};

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
};

const resolveInstanceUrl = (body) => {
  const domain =
    sanitizeDomain(body.custom_canvas_api_domain) ||
    sanitizeDomain(body.tool_consumer_instance_guid) ||
    "canvas.instructure.com";
  return `https://${domain}`;
};

const resolveFeatureBenchBaseUrl = () => {
  return (
    sanitizeBaseUrl(process.env.PUBLIC_APP_URL) ||
    sanitizeBaseUrl(process.env.APP_PUBLIC_URL) ||
    sanitizeBaseUrl(process.env.APP_URL) ||
    "https://featurebench.com"
  );
};

const getFeatureBenchCourseUrl = (courseId) => {
  const base = resolveFeatureBenchBaseUrl();
  if (!courseId) return base;
  return `${base}/${courseId}`;
};

const isStaffLaunch = (body) => {
  const combined = [body?.roles, body?.ext_roles]
    .filter(Boolean)
    .join(",")
    .toLowerCase();
  if (!combined) return false;
  const staffTokens = [
    "instructor",
    "teacher",
    "teachingassistant",
    "urn:lti:instrole:ims/lis/instructor",
    "urn:lti:role:ims/lis/instructor",
    "urn:lti:role:ims/lis/teachingassistant",
    ":ta",
  ];
  return staffTokens.some((token) => combined.includes(token));
};

const upsertCanvasIntegration = async ({ courseId, consumerKey, body }) => {
  const instanceUrl = resolveInstanceUrl(body);
  const integrationData = {
    instanceUrl,
    clientId: consumerKey,
    clientSecret: consumerKey,
    canvasCourseId:
      body.custom_canvas_course_id ||
      body.context_id ||
      body.resource_link_id ||
      null,
    canvasAccountId:
      body.custom_canvas_account_id || body.custom_canvas_root_account_id || null,
    ltiDeploymentId:
      body.custom_canvas_lti_deployment_id || body.resource_link_id || null,
    ltiIssuer:
      body.tool_consumer_instance_guid ||
      body.tool_consumer_info_product_family_code ||
      null,
    developerKey: body.tool_consumer_instance_name || null,
  };

  await prisma.canvasIntegration.upsert({
    where: { courseId },
    create: {
      courseId,
      ...integrationData,
    },
    update: integrationData,
  });
};

const buildLaunchPage = ({
  heading,
  intro,
  bodyHtml,
  metaHtml,
  variant = "default",
  badgeText = "Canvas • FeatureBench",
}) => {
  const isError = variant === "error";
  const badgeBg = isError ? "var(--accent)" : "var(--secondary)";
  const badgeColor = isError
    ? "var(--accent-contrast-primary)"
    : "var(--secondary-contrast-primary)";
  const headingColor = isError ? "var(--accent)" : "var(--primary)";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FeatureBench LTI Launch</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Stack+Sans+Text:wght@300;400;500;600&display=swap');
      :root {
        --ratio: 10%;
        --primary: #0d283f;
        --primary-contrast-primary: #ffffff;
        --primary-contrast-secondary: color-mix(
          in srgb,
          var(--primary) var(--ratio),
          var(--primary-contrast-primary)
        );
        --body: hsl(20, 10%, 98%);
        --body-contrast-primary: #000000;
        --body-contrast-secondary: color-mix(
          in srgb,
          var(--body) var(--ratio),
          var(--body-contrast-primary)
        );
        --accent: #d17128;
        --accent-contrast-primary: #ffffff;
        --accent-contrast-secondary: color-mix(
          in srgb,
          var(--accent) var(--ratio),
          var(--accent-contrast-primary)
        );
        --surface: #ffffff;
        --surface-contrast-primary: #000000;
        --surface-contrast-secondary: color-mix(
          in srgb,
          var(--surface) var(--ratio),
          var(--surface-contrast-primary)
        );
        --secondary: #f7f7f7;
        --secondary-contrast-primary: #000000;
        --secondary-contrast-secondary: color-mix(
          in srgb,
          var(--secondary) var(--ratio),
          var(--secondary-contrast-primary)
        );
        --border: #dadcdf;
        --action: #0277c8;
        --action-contrast-primary: #ffffff;
        --action-contrast-secondary: color-mix(
          in srgb,
          var(--action) var(--ratio),
          var(--action-contrast-primary)
        );
        --radius-lg: 12px;
      }
      body {
        font-family: "Stack Sans Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--body);
        color: var(--body-contrast-primary);
        margin: 0;
        padding: 32px 16px;
        min-height: 100vh;
        display: flex;
        align-items: center;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        background: var(--surface);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        padding: 32px;
        width: 100%;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        color: ${badgeColor};
        background: ${badgeBg};
        border-radius: 999px;
        padding: 6px 14px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      h1 {
        font-size: 2rem;
        margin: 1rem 0 0.5rem;
        color: ${headingColor};
        font-weight: 600;
      }
      p {
        font-size: 1rem;
        line-height: 1.6;
        margin: 0 0 1rem;
        color: var(--surface-contrast-secondary);
      }
      .lead {
        font-size: 1.05rem;
        font-weight: 500;
        color: var(--surface-contrast-primary);
      }
      .meta {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
        font-size: 0.9rem;
        color: var(--secondary-contrast-primary);
      }
      code {
        font-family: "SFMono-Regular", Consolas, ui-monospace, "Liberation Mono", Menlo, monospace;
        background: var(--secondary);
        padding: 0.15rem 0.35rem;
        border-radius: 6px;
        font-size: 0.9rem;
        color: var(--secondary-contrast-primary);
      }
      strong {
        color: var(--surface-contrast-primary);
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: var(--radius-lg);
        border: none;
        background: var(--action);
        color: var(--action-contrast-primary);
        font-weight: 600;
        padding: 0.85rem 1.75rem;
        text-decoration: none;
        font-size: 1rem;
        transition: opacity 0.2s ease;
      }
      .button:hover {
        opacity: 0.9;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">${badgeText}</div>
      <h1>${heading}</h1>
      ${intro ? `<p class="lead">${intro}</p>` : ""}
      ${bodyHtml ?? ""}
      ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ""}
    </main>
  </body>
</html>`;
};

export const post = [
  urlEncodedParser,
  async (req, res) => {
    logLaunchAttempt(req);

    const requiredFields = [
      "oauth_consumer_key",
      "lti_version",
      "lti_message_type",
    ];
    const missing = requiredFields.filter((field) => !req.body?.[field]);
    if (missing.length > 0) {
      console.warn(
        "[Canvas LTI] Launch missing required fields:",
        missing.join(", ")
      );
      return res.status(400).json({
        error: "Invalid LTI launch payload",
        missing,
      });
    }

    const consumerKey = (req.body.oauth_consumer_key || "").trim();
    const course =
      consumerKey && (await findCourseByConsumerKey(consumerKey));
    if (!course) {
      console.warn(
        "[Canvas LTI] Rejecting launch. Unknown consumer key:",
        consumerKey
      );
      const errorPage = buildLaunchPage({
        heading: "Client Secret not recognized",
        intro:
          "Update the Canvas app with the Consumer Key listed in FeatureBench, then try again.",
        bodyHtml: `<p>Canvas sent <code>${
          consumerKey || "not provided"
        }</code> as the Client Secret, but it doesn’t match any FeatureBench course.</p>`,
        variant: "error",
        badgeText: "Canvas Launch",
      });
      return res.status(200).type("text/html").send(errorPage);
    }

    const userName =
      req.body.lis_person_name_full ||
      req.body.lis_person_name_family ||
      req.body.lis_person_name_given ||
      "there";

    const courseName = req.body.context_title || req.body.context_label || "";

    await upsertCanvasIntegration({
      courseId: course.id,
      consumerKey,
      body: req.body || {},
    });

    const staffLaunch = isStaffLaunch(req.body);
    const courseUrl = getFeatureBenchCourseUrl(course.id);

    const launchPage = staffLaunch
      ? buildLaunchPage({
          heading: "FeatureBench is connected to Canvas",
          intro: `Welcome${
            courseName ? ` to ${courseName}` : ""
          }, ${userName}. FeatureBench is synced with your Canvas course.`,
          bodyHtml: `<p>Your Canvas launch is linked to the FeatureBench course <strong>${course.name}</strong>. We’ll use this connection to finalize assignment sync, roster imports, and grade passback.</p>`,
          metaHtml: `Canvas reference: <code>${
            req.body.resource_link_id || "n/a"
          }</code><br />Client Secret: <code>${course.id}</code>`,
          badgeText: "Canvas Launch",
        })
      : buildLaunchPage({
          heading: "Continue in FeatureBench",
          intro: "",
          bodyHtml: `<p><a class="button" href="${courseUrl}" target="_blank" rel="noopener noreferrer">Open FeatureBench</a></p>`,
          badgeText: "Canvas Launch",
        });

    res.status(200).type("text/html").send(launchPage);
  },
];
