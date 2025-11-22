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

const resolveInstanceUrl = (body) => {
  const domain =
    sanitizeDomain(body.custom_canvas_api_domain) ||
    sanitizeDomain(body.tool_consumer_instance_guid) ||
    "canvas.instructure.com";
  return `https://${domain}`;
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

const buildLaunchPage = ({ course, courseName, userName, resourceLinkId }) => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FeatureBench LTI Launch</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7fb; padding: 32px; color: #222; }
      .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 520px; margin: 0 auto; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); }
      h1 { margin-top: 0; font-size: 1.75rem; }
      p { line-height: 1.5; margin: 0 0 1rem; }
      code { background: #f1f5f9; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 0.9rem; }
      .pill { display: inline-block; background: #eef2ff; color: #3730a3; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; margin-bottom: 1rem; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="pill">Canvas • FeatureBench</div>
      <h1>Welcome${courseName ? ` to ${courseName}` : ""}, ${userName}!</h1>
      <p>Your Canvas course is now talking to FeatureBench.</p>
      <p>This launch is linked to your FeatureBench course <strong>${course.name}</strong>.</p>
      <p>This build logs every launch so we can finish wiring up assignments and grades next.</p>
      <p style="margin-top: 2rem; font-size: 0.85rem; color: #475569;">
        Canvas reference: <code>${resourceLinkId || "n/a"}</code><br />
        Consumer Key: <code>${course.id}</code>
      </p>
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
      return res.status(404).json({
        error:
          "No FeatureBench course is linked to that Consumer Key. Edit the Canvas app with the Consumer Key listed in FeatureBench.",
        consumerKey: consumerKey || undefined,
      });
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

    const launchPage = buildLaunchPage({
      course,
      courseName,
      userName,
      resourceLinkId: req.body.resource_link_id,
    });

    res.status(200).type("text/html").send(launchPage);
  },
];
