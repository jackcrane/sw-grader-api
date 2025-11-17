const defaultBaseUrl = "http://worker.featurebench.com";

const normalizeBaseUrl = (value) => {
  if (!value) return defaultBaseUrl;
  return value.replace(/\/+$/, "") || defaultBaseUrl;
};

export const GRADER_BASE_URL = normalizeBaseUrl(process.env.GRADER_BASE_URL);
export const ANALYZE_URL = `${GRADER_BASE_URL}/analyze`;
export const HEALTH_URL = `${GRADER_BASE_URL}/healthz`;
