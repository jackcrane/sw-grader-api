import {
  acceptsJson,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";

export const post = async (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
  if (acceptsJson(req)) {
    return res.json({ success: true });
  }
  return res.redirect("/login");
};

export const additionalPaths = ["/logout"];
