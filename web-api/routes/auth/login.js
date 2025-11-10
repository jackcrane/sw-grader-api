import { acceptsJson } from "../../util/auth.js";
import { workos } from "../../util/workos.js";

const getRedirectUri = () =>
  process.env.WORKOS_REDIRECT_URI ||
  "https://jack-mac.jackcrane.rocks/api/auth/callback";

export const get = (req, res) => {
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri: getRedirectUri(),
    clientId: process.env.WORKOS_CLIENT_ID,
  });

  if (acceptsJson(req)) {
    return res.json({ authorizationUrl });
  }

  return res.redirect(authorizationUrl);
};
