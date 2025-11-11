import { HEALTH_URL } from "./graderEndpoints.js";

const DEFAULT_INTERVAL_MS = Number(
  process.env.GRADER_HEALTH_INTERVAL_MS || 30000
);
const DEFAULT_TIMEOUT_MS = 10000;

const status = {
  online: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  pendingSubmissionCount: 0,
};

const listeners = new Set();
let intervalHandle = null;
let inflightCheck = null;

const notifyStatusChange = () => {
  for (const listener of listeners) {
    try {
      listener({ ...status });
    } catch (error) {
      console.warn("Grader status listener threw", error);
    }
  }
};

const setOnlineState = (online, errorMessage = null) => {
  const previousOnline = status.online;
  status.online = online;
  status.lastCheckedAt = Date.now();
  if (online) {
    status.lastSuccessAt = status.lastCheckedAt;
    status.lastError = null;
    status.consecutiveFailures = 0;
  } else {
    status.lastError = errorMessage;
    status.consecutiveFailures += 1;
  }
  if (previousOnline !== online) {
    notifyStatusChange();
  }
};

const performHealthFetch = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      setOnlineState(false, `Health check failed (${response.status}).`);
      return;
    }
    const payload = await response
      .json()
      .catch(() => ({ ok: response.ok }));
    const ok = payload?.ok !== false;
    if (ok) {
      setOnlineState(true);
    } else {
      setOnlineState(false, "Health check reported unhealthy.");
    }
  } catch (error) {
    setOnlineState(false, error?.message || "Health check failed.");
  } finally {
    clearTimeout(timeout);
  }
};

const scheduleHealthChecks = () => {
  if (intervalHandle) return;
  const tick = async () => {
    if (inflightCheck) return;
    inflightCheck = performHealthFetch()
      .catch(() => {
        // errors handled inside performHealthFetch
      })
      .finally(() => {
        inflightCheck = null;
      });
    await inflightCheck;
  };

  tick(); // immediate
  intervalHandle = setInterval(tick, DEFAULT_INTERVAL_MS);
};

export const startGraderHealthMonitor = () => {
  scheduleHealthChecks();
};

export const getGraderStatus = () => ({ ...status });

export const isGraderOnline = () => status.online === true;

export const subscribeToGraderStatus = (listener) => {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const updatePendingSubmissionCount = (count) => {
  if (
    typeof count === "number" &&
    Number.isFinite(count) &&
    count >= 0 &&
    status.pendingSubmissionCount !== count
  ) {
    status.pendingSubmissionCount = count;
    notifyStatusChange();
  }
};

export const recordAnalyzerFailure = (error) => {
  const message =
    typeof error === "string" ? error : error?.message || "Analyzer error.";
  setOnlineState(false, message);
};

export const recordAnalyzerSuccess = () => {
  setOnlineState(true);
};

