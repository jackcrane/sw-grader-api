const API_BASE =
  process.env.WEB_API_BASE_URL || process.env.GRADER_RESULT_BASE_URL;
const DEFAULT_API_BASE = "http://localhost:3000";
const SHARED_SECRET = process.env.GRADER_SHARED_SECRET?.trim();

const buildResultUrl = (submissionId) => {
  const base = API_BASE?.trim() || DEFAULT_API_BASE;
  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase}/api/system/grader/submissions/${submissionId}/result`;
};

export const reportGraderResult = async ({
  submissionId,
  volume,
  surfaceArea,
  screenshot,
}) => {
  if (!submissionId) throw new Error("submissionId is required.");
  const url = buildResultUrl(submissionId);
  const payload = {
    volume,
    surfaceArea,
    screenshot,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SHARED_SECRET ? { "x-grader-secret": SHARED_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to report grader result (${response.status}): ${
        text?.slice?.(0, 200) || "unknown error"
      }`
    );
  }

  return response.json().catch(() => ({}));
};
