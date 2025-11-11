import { ANALYZE_URL } from "./graderEndpoints.js";
import {
  recordAnalyzerFailure,
  recordAnalyzerSuccess,
} from "./graderHealth.js";

let analyzerChain = Promise.resolve();

const enqueueAnalyzerCall = (task) => {
  const run = analyzerChain.then(task, task);
  analyzerChain = run.catch(() => {});
  return run;
};

const buildAnalyzeUrl = (unitSystem) => {
  const endpoint = new URL(ANALYZE_URL);
  if (unitSystem) {
    endpoint.searchParams.set("unitSystem", unitSystem);
  }
  endpoint.searchParams.set("screenshot", "true");
  return endpoint;
};

const readResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) {
    if (contentType.includes("application/json")) return {};
    return "";
  }
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const analyzePart = async ({
  fileBuffer,
  filename = "submission.sldprt",
  unitSystem,
  mimeType = "application/octet-stream",
}) => {
  if (!fileBuffer) {
    throw new Error("analyzePart requires a file buffer.");
  }

  return enqueueAnalyzerCall(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000 * 60 * 2); // 2 minutes

    try {
      const endpoint = buildAnalyzeUrl(unitSystem);
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([fileBuffer], { type: mimeType }),
        filename
      );

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const payload = await readResponseBody(response);

      if (!response.ok) {
        const errorMessage =
          typeof payload === "string"
            ? payload
            : payload?.error || `Analyzer request failed (${response.status}).`;
        throw new Error(errorMessage);
      }

      recordAnalyzerSuccess();
      return payload;
    } catch (error) {
      recordAnalyzerFailure(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
};
