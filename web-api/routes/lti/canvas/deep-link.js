import express from "express";

const urlEncodedParser = express.urlencoded({ extended: false });

const logDeepLinkAttempt = (req) => {
  console.log("[Canvas LTI] Deep Link request headers:", req.headers);
  console.log("[Canvas LTI] Deep Link request body:", req.body);
};

export const post = [
  urlEncodedParser,
  (req, res) => {
    logDeepLinkAttempt(req);

    if (!req.body?.lti_message_type) {
      return res.status(400).json({
        error: "Missing LTI message type",
      });
    }

    const message = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FeatureBench Deep Link</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: white; margin: 0; padding: 32px; }
      .panel { max-width: 560px; margin: 0 auto; background: rgba(15,23,42,0.7); border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.08); }
      h1 { margin-top: 0; }
      p { line-height: 1.6; }
      button { margin-top: 24px; background: #22d3ee; color: #0f172a; border: none; border-radius: 8px; padding: 12px 24px; font-size: 1rem; cursor: pointer; }
    </style>
  </head>
  <body>
    <section class="panel">
      <h1>Assignment linking coming soon</h1>
      <p>FeatureBench received your Canvas deep-link request and logged it for our team.</p>
      <p>We're finalizing the assignment builder experience. Close this window or tap continue to return to Canvas.</p>
      <form method="dialog">
        <button type="submit">Return to Canvas</button>
      </form>
    </section>
  </body>
</html>`;

    res.status(200).type("text/html").send(message);
  },
];
