import {
  acceptsJson,
  getSessionCookie,
  loadSessionFromCookie,
  sanitizeUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";
import { findUserById } from "../../util/users.js";

const unauthenticatedResponse = (res) =>
  res.status(401).json({ authenticated: false });

export const get = async (req, res) => {
  if (!acceptsJson(req)) {
    res.setHeader("Vary", "Accept");
  }

  const cookieValue = getSessionCookie(req);
  if (!cookieValue) {
    return unauthenticatedResponse(res);
  }

  try {
    const session = loadSessionFromCookie(cookieValue);
    if (!session?.userId) {
      return unauthenticatedResponse(res);
    }
    const user = await findUserById(session.userId);
    if (!user || user.deleted) {
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
      return unauthenticatedResponse(res);
    }

    return res.json({
      authenticated: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res
      .status(401)
      .json({ authenticated: false, error: error?.message || "unauthenticated" });
  }
};
