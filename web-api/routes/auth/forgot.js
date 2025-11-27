import { URL } from "node:url";
import {
  acceptsJson,
} from "../../util/auth.js";
import {
  findUserByEmail,
  normalizeEmail,
} from "../../util/users.js";
import {
  createPasswordResetToken,
  RESET_TOKEN_TTL_MINUTES,
} from "../../util/passwordReset.js";
import { sendEmail } from "../../util/postmark.js";

const successResponse = (res) => res.json({ success: true });

const buildAppBaseUrl = (req) => {
  const envUrl =
    process.env.APP_BASE_URL ||
    process.env.WEB_APP_BASE_URL ||
    process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const origin = req.get?.("origin");
  if (origin) return origin;

  const host = req.get?.("host");
  if (host) {
    const forwardedProto = req.get?.("x-forwarded-proto");
    const protocol = forwardedProto || req.protocol || "https";
    return `${protocol}://${host}`;
  }

  return "https://featurebench.com";
};

const buildResetUrl = (req, token) => {
  const baseUrl = buildAppBaseUrl(req);
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
};

const sendResetEmail = async (user, resetUrl) => {
  const name = user.firstName ? `Hi ${user.firstName},` : "Hi there,";
  const text = `${name}

We received a request to reset the password for your FeatureBench account.

Reset your password: ${resetUrl}

This link is valid for ${RESET_TOKEN_TTL_MINUTES} minutes. If you didn't request a reset, you can safely ignore this email.`;

  await sendEmail({
    to: user.email,
    subject: "Reset your FeatureBench password",
    text,
  });
};

export const post = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "missing_email" });
  }

  const user = await findUserByEmail(email);
  if (!user || user.deleted) {
    return successResponse(res);
  }

  const { token } = await createPasswordResetToken(user.id);
  const resetUrl = buildResetUrl(req, token);
  sendResetEmail(user, resetUrl).catch(() => {});

  return successResponse(res);
};
