import { workos } from "./workos.js";

export const SESSION_COOKIE_NAME = "wos-session";

const isProduction = process.env.NODE_ENV === "production";

export const sessionCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
};

export const getSessionCookie = (req) =>
  req?.cookies?.[SESSION_COOKIE_NAME] ?? null;

export const loadSessionFromCookie = (cookieValue) => {
  if (!cookieValue) return null;

  return workos.userManagement.loadSealedSession({
    sessionData: cookieValue,
    cookiePassword: process.env.WORKOS_COOKIE_PASSWORD,
  });
};

export const acceptsJson = (req) => {
  const accept = req.headers.accept || "";
  const requestedWith = req.headers["x-requested-with"] || "";

  return (
    accept.includes("application/json") ||
    requestedWith.toLowerCase() === "xmlhttprequest"
  );
};

export const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
  };
};
