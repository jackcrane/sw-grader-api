import {
  acceptsJson,
  getSessionCookie,
  loadSessionFromCookie,
  sanitizeUser,
} from "../../util/auth.js";

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
    const { authenticated, user, reason } = await session.authenticate();

    if (!authenticated) {
      return res
        .status(401)
        .json({ authenticated: false, error: reason || "unauthenticated" });
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
