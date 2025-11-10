import {
  acceptsJson,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../../util/auth.js";
import { workos } from "../../util/workos.js";

const buildRedirectResponse = (req, res, user) => {
  if (acceptsJson(req)) {
    return res.json({ authenticated: true, user });
  }

  const redirectPath = process.env.POST_LOGIN_REDIRECT_PATH || "/";
  return res.redirect(redirectPath);
};

export const callbackHandler = async (req, res) => {
  const code = req.query.code;

  if (!code) {
    if (acceptsJson(req)) {
      return res.status(400).json({
        authenticated: false,
        error: "missing_authorization_code",
      });
    }
    return res.redirect("/login");
  }

  try {
    const authenticateResponse =
      await workos.userManagement.authenticateWithCode({
        clientId: process.env.WORKOS_CLIENT_ID,
        code,
        session: {
          sealSession: true,
          cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
        },
      });

    const { user, sealedSession } = authenticateResponse;

    res.cookie(SESSION_COOKIE_NAME, sealedSession, sessionCookieOptions);

    return buildRedirectResponse(req, res, user);
  } catch (error) {
    const reason = error?.message || "authentication_failed";
    if (acceptsJson(req)) {
      return res.status(401).json({ authenticated: false, error: reason });
    }
    return res.redirect("/login");
  }
};

export const get = callbackHandler;
