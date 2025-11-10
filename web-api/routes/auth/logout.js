import {
  acceptsJson,
  getSessionCookie,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  loadSessionFromCookie,
} from "../../util/auth.js";

const respond = (req, res, payload, status = 200) => {
  if (acceptsJson(req)) {
    return res.status(status).json(payload);
  }
  if (payload.redirect) {
    return res.redirect(payload.redirect);
  }
  return res.redirect("/");
};

export const all = async (req, res) => {
  const cookieValue = getSessionCookie(req);

  if (!cookieValue) {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    return respond(req, res, { success: true, redirect: "/" });
  }

  try {
    const session = loadSessionFromCookie(cookieValue);
    const logoutUrl = await session.getLogoutUrl();

    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    return respond(req, res, { success: true, redirect: logoutUrl });
  } catch (error) {
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
    const message = error?.message || "logout_failed";
    return respond(req, res, { success: false, error: message }, 400);
  }
};
