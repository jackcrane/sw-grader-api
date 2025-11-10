import { acceptsJson } from "../../util/auth.js";
import { workos } from "../../util/workos.js";

const getRedirectUri = () =>
  process.env.WORKOS_REDIRECT_URI ||
  "https://jack-mac.jackcrane.rocks/callback";

const buildAuthorizationUrl = () =>
  workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri: getRedirectUri(),
    clientId: process.env.WORKOS_CLIENT_ID,
  });

export const loginHandler = (req, res) => {
  const authorizationUrl = buildAuthorizationUrl();

  if (acceptsJson(req)) {
    return res.json({ authorizationUrl });
  }

  return res.redirect(authorizationUrl);
};

export const get = loginHandler;
