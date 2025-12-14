import {
  acceptsJson,
  createSessionToken,
  sanitizeUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";
import {
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
} from "../../util/passwordReset.js";
import { updateUserPassword } from "../../util/users.js";
import { posthog } from "../../util/posthog.js";

const MIN_PASSWORD_LENGTH = 8;

const tokenFromRequest = (req) => {
  const token = req.query?.token ?? req.body?.token;
  if (Array.isArray(token)) return token[0];
  return typeof token === "string" ? token.trim() : "";
};

const invalidTokenResponse = (res) =>
  res.status(400).json({ success: false, error: "invalid_token" });

const missingTokenResponse = (res) =>
  res.status(400).json({ success: false, error: "missing_token" });

export const get = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const token = tokenFromRequest(req);
  if (!token) {
    posthog.capture({
      distinctId: "unknown",
      event: "password reset token validation failed",
      properties: { reason: "missing_token" },
    });
    return missingTokenResponse(res);
  }

  const tokenRecord = await findValidPasswordResetToken(token);
  const user = tokenRecord?.user;
  if (!tokenRecord || !user || user.deleted) {
    posthog.capture({
      distinctId: user?.id ?? "unknown",
      event: "password reset token validation failed",
      properties: { reason: "invalid_token" },
    });
    return invalidTokenResponse(res);
  }

  posthog.capture({
    distinctId: user.id,
    event: "password reset token validated",
    properties: { email: user.email },
  });

  return res.json({
    success: true,
    valid: true,
    email: user.email,
    expiresAt: tokenRecord.expiresAt,
  });
};

export const post = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const token = tokenFromRequest(req);
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!token) {
    posthog.capture({
      distinctId: "unknown",
      event: "password reset failed",
      properties: { reason: "missing_token" },
    });
    return missingTokenResponse(res);
  }

  if (!password) {
    posthog.capture({
      distinctId: "unknown",
      event: "password reset failed",
      properties: { reason: "missing_password" },
    });
    return res.status(400).json({ success: false, error: "missing_password" });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    posthog.capture({
      distinctId: "unknown",
      event: "password reset failed",
      properties: { reason: "password_too_short" },
    });
    return res.status(400).json({
      success: false,
      error: "password_too_short",
      minLength: MIN_PASSWORD_LENGTH,
    });
  }

  const tokenRecord = await findValidPasswordResetToken(token);
  const user = tokenRecord?.user;
  if (!tokenRecord || !user || user.deleted) {
    posthog.capture({
      distinctId: user?.id ?? "unknown",
      event: "password reset failed",
      properties: { reason: "invalid_token" },
    });
    return invalidTokenResponse(res);
  }

  await updateUserPassword(user.id, password);
  await markPasswordResetTokenUsed(tokenRecord.id);

  const sealedSession = createSessionToken(user.id);
  res.cookie(SESSION_COOKIE_NAME, sealedSession, sessionCookieOptions);

  posthog.capture({
    distinctId: user.id,
    event: "password reset completed",
    properties: { email: user.email },
  });

  return res.json({
    success: true,
    authenticated: true,
    user: sanitizeUser(user),
  });
};
