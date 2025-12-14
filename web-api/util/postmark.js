import { ServerClient } from "postmark";
import { posthog } from "./posthog.js";

const apiToken = process.env.POSTMARK_API_TOKEN;
const fromAddress = process.env.POSTMARK_FROM_EMAIL;
const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound";

const client = apiToken ? new ServerClient(apiToken) : null;

const logMissingConfig = () => {
  if (!apiToken) {
    console.warn(
      "Postmark API token is not configured. Emails will not be sent."
    );
  }
  if (!fromAddress) {
    console.warn(
      "POSTMARK_FROM_EMAIL is not configured. Emails will not be sent."
    );
  }
};

export const sendEmail = async ({ to, subject, text }) => {
  if (to.includes("featurebench-test.com")) {
    console.log("[MOCK] Sending email to", to, "with subject", subject);
    posthog.capture({
      distinctId: to,
      event: "email send mocked",
      properties: { subject },
    });
    return;
  } // Drop test emails

  if (!client || !fromAddress) {
    logMissingConfig();
    return;
  }

  console.log("Sending email to", to, "with subject", subject);

  try {
    await client.sendEmail({
      From: fromAddress,
      To: to,
      Subject: subject,
      TextBody: text,
      MessageStream: messageStream,
    });
    posthog.capture({
      distinctId: to,
      event: "email sent",
      properties: { subject },
    });
  } catch (error) {
    console.error("Failed to send Postmark email", error);
    posthog.capture({
      distinctId: to,
      event: "email send failed",
      properties: {
        subject,
        error: error?.message ?? "unknown_error",
      },
    });
  }
};
