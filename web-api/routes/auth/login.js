import {
  acceptsJson,
  createSessionToken,
  sanitizeUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";
import {
  findUserByEmail,
  normalizeEmail,
  verifyPassword,
} from "../../util/users.js";
import { sendEmail } from "../../util/postmark.js";

const sendLoginEmail = async (user) => {
  const name = user.firstName ? `Hi ${user.firstName},` : "Hi there,";
  const text = `${name}

We noticed a new login to your FeatureBench account just now. If this was you, no further action is needed.

If this wasn't you, please reach out to the FeatureBench team immediately so we can help secure your account.

— The FeatureBench Team`;

  await sendEmail({
    to: user.email,
    subject: "New login to your FeatureBench account",
    text,
  });
};

const invalidCredentials = (res) =>
  res
    .status(401)
    .json({ authenticated: false, error: "invalid_credentials" });

export const post = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res
      .status(400)
      .json({ authenticated: false, error: "missing_credentials" });
  }

  const user = await findUserByEmail(email);
  if (!user || user.deleted) {
    return invalidCredentials(res);
  }

  const isValidPassword = await verifyPassword(user, password);
  if (!isValidPassword) {
    return invalidCredentials(res);
  }

  const sealedSession = createSessionToken(user.id);
  res.cookie(SESSION_COOKIE_NAME, sealedSession, sessionCookieOptions);

  sendLoginEmail(user).catch(() => {});

  return res.json({
    authenticated: true,
    user: sanitizeUser(user),
  });
};
