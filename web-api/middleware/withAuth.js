import {
  acceptsJson,
  getSessionCookie,
  loadSessionFromCookie,
  sanitizeUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../util/auth.js";
import { findUserById } from "../util/users.js";

const respondUnauthenticated = (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
  if (acceptsJson(req)) {
    return res.status(401).json({ error: "unauthenticated" });
  }
  return res.redirect("/login");
};

async function withAuth(req, res, next) {
  const cookieValue = getSessionCookie(req);
  if (!cookieValue) {
    return respondUnauthenticated(req, res);
  }

  const session = loadSessionFromCookie(cookieValue);
  if (!session?.userId) {
    return respondUnauthenticated(req, res);
  }

  const user = await findUserById(session.userId);
  if (!user || user.deleted) {
    return respondUnauthenticated(req, res);
  }

  req.user = sanitizeUser(user);
  return next();
}

export { withAuth };
