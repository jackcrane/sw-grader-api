import {
  acceptsJson,
  createSessionToken,
  sanitizeUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";
import {
  createUserWithPassword,
  findUserByEmail,
  normalizeEmail,
} from "../../util/users.js";
import { sendEmail } from "../../util/postmark.js";
import { ensureStripeCustomerForUser } from "../../services/stripeCustomers.js";

const MIN_PASSWORD_LENGTH = 8;

const sendWelcomeEmail = async (user) => {
  const maybeName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.email;
  const text = `Welcome to FeatureBench, ${maybeName}!

Your account has been created and you're ready get started.

If you didn't expect this email, let us know right away.`;

  await sendEmail({
    to: user.email,
    subject: "Welcome to FeatureBench",
    text,
  });
};

export const post = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const firstName =
    typeof req.body?.firstName === "string"
      ? req.body.firstName.trim() || null
      : null;
  const lastName =
    typeof req.body?.lastName === "string"
      ? req.body.lastName.trim() || null
      : null;

  if (!email || !password) {
    return res
      .status(400)
      .json({ authenticated: false, error: "missing_fields" });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      authenticated: false,
      error: "password_too_short",
      minLength: MIN_PASSWORD_LENGTH,
    });
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return res
      .status(409)
      .json({ authenticated: false, error: "email_in_use" });
  }

  const user = await createUserWithPassword({
    email,
    password,
    firstName,
    lastName,
  });
  await ensureStripeCustomerForUser(user);

  const sealedSession = createSessionToken(user.id);
  res.cookie(SESSION_COOKIE_NAME, sealedSession, sessionCookieOptions);

  sendWelcomeEmail(user).catch(() => {});

  return res.status(201).json({
    authenticated: true,
    user: sanitizeUser(user),
  });
};
