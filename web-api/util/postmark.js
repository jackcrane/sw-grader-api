import { ServerClient } from "postmark";

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

export const sendEmail = async ({ to, subject, text, cc }) => {
  if (!client || !fromAddress) {
    logMissingConfig();
    return;
  }

  console.log("Sending email to", to, "with subject", subject);

  try {
    const payload = {
      From: fromAddress,
      To: to,
      Subject: subject,
      TextBody: text,
      MessageStream: messageStream,
    };
    if (cc) {
      payload.Cc = cc;
    }
    await client.sendEmail(payload);
  } catch (error) {
    console.error("Failed to send Postmark email", error);
  }
};
