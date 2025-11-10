import {
  getSessionCookie,
  loadSessionFromCookie,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../util/auth.js";

async function withAuth(req, res, next) {
  const cookieValue = getSessionCookie(req);
  if (!cookieValue) {
    return res.redirect("/login");
  }

  const session = loadSessionFromCookie(cookieValue);

  const { authenticated, reason } = await session.authenticate();

  if (authenticated) {
    return next();
  }

  // If the cookie is missing, redirect to login
  if (!authenticated && reason === "no_session_cookie_provided") {
    return res.redirect("/login");
  }

  // If the session is invalid, attempt to refresh
  try {
    const { authenticated, sealedSession } = await session.refresh();

    if (!authenticated) {
      return res.redirect("/login");
    }

    // update the cookie
    res.cookie(SESSION_COOKIE_NAME, sealedSession, sessionCookieOptions);

    // Redirect to the same route to ensure the updated cookie is used
    return res.redirect(req.originalUrl);
  } catch (e) {
    // Failed to refresh access token, redirect user to login page
    // after deleting the cookie
    res.clearCookie("wos-session");
    res.redirect("/login");
  }
}

export { withAuth };
