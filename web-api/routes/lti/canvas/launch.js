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

    const userName =
      req.body.lis_person_name_full ||
      req.body.lis_person_name_family ||
      req.body.lis_person_name_given ||
      "there";

    const courseName = req.body.context_title || req.body.context_label || "";
    const launchPage = `Your course is connected to FeatureBench`;

    res.status(200).type("text/html").send(launchPage);
  },
];
