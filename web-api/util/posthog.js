import { PostHog } from "posthog-node";
import dotenv from "dotenv";
dotenv.config();

export const posthog = new PostHog(process.env.POSTHOG_API_KEY, {
  host: "https://us.i.posthog.com",
});
