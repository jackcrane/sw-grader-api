import dotenv from "dotenv";
dotenv.config();

const defaultBaseUrl = process.env.WORKER_URL;

const normalizeBaseUrl = (value) => {
  if (!value) return defaultBaseUrl;
  return value.replace(/\/+$/, "") || defaultBaseUrl;
};

export const GRADER_BASE_URL = normalizeBaseUrl(process.env.GRADER_BASE_URL);
export const HEALTH_URL = `${GRADER_BASE_URL}/healthz`;
