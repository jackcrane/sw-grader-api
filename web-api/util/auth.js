import jwt from "jsonwebtoken";

export const SESSION_COOKIE_NAME = "wos-session";

const isProduction = process.env.NODE_ENV === "production";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

export const sessionCookieOptions = {
  path: "/",
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: SESSION_COOKIE_MAX_AGE_MS,
};

export const getSessionCookie = (req) =>
  req?.cookies?.[SESSION_COOKIE_NAME] ?? null;

const getJwtSecret = () => {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET environment variable is not set");
  }
  return secret;
};

export const loadSessionFromCookie = (cookieValue) => {
  if (!cookieValue) return null;
  try {
    return jwt.verify(cookieValue, getJwtSecret());
  } catch (error) {
    return null;
  }
};

export const createSessionToken = (userOrId) => {
  const userId = typeof userOrId === "string" ? userOrId : userOrId?.id;
  if (!userId) {
    throw new Error("A user ID is required to create a session");
  }
  return jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
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

export const sanitizeUser = (user, dbUser = null) => {
  if (!user) return null;
  const source = dbUser ?? user;
  return {
    id: source.id,
    email: source.email,
    firstName: source.firstName ?? null,
    lastName: source.lastName ?? null,
    profilePictureUrl: null,
    localUserId: source.id,
    canCreateCourses: source.canCreateCourses ?? false,
  };
};
