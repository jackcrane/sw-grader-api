import { withAuth } from "../../middleware/withAuth.js";
import {
  sanitizeUser,
  loadSessionFromCookie,
  getSessionCookie,
} from "../../util/auth.js";

const readUser = async (req) => {
  const session = loadSessionFromCookie(getSessionCookie(req));
  const { user } = await session.authenticate();
  return sanitizeUser(user);
};

export const get = [
  withAuth,
  async (req, res) => {
    const user = await readUser(req);
    return res.json({ user });
  },
];
