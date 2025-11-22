import express from "express";

const urlEncodedParser = express.urlencoded({ extended: false });

const logLaunchAttempt = (req) => {
  console.log("[Canvas LTI] Launch request headers:", req.headers);
  console.log("[Canvas LTI] Launch request body:", req.body);
};

export const post = [
  urlEncodedParser,
  (req, res) => {
    logLaunchAttempt(req);

    const requiredFields = ["oauth_consumer_key", "lti_version", "lti_message_type"];
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

    const userName =
      req.body.lis_person_name_full ||
      req.body.lis_person_name_family ||
      req.body.lis_person_name_given ||
      "there";

    const courseName = req.body.context_title || req.body.context_label || "";
    const launchPage = `<!doctype html>
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
      <p>This build logs every launch so we can finish wiring up assignments and grades next.</p>
      <p>If you were expecting an assignment picker, hang tight—we'll publish it shortly.</p>
      <p style="margin-top: 2rem; font-size: 0.85rem; color: #475569;">
        Reference: <code>${req.body.resource_link_id || "n/a"}</code>
      </p>
    </main>
  </body>
</html>`;

    res.status(200).type("text/html").send(launchPage);
  },
];
