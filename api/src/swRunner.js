import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

const parseToolJson = (output) => {
  if (!output) return null;
  try {
    return JSON.parse(String(output).trim());
  } catch {
    return null;
  }
};

const buildSwToolError = (payload, fallbackMessage = "SW tool failed.") => {
  const details = payload && typeof payload === "object" ? payload : {};
  const message = details.error || fallbackMessage;
  const err = new Error(`SW tool error: ${message}`);
  err.name = "SwToolError";
  err.code = details.code ?? 1;
  err.isSwToolError = true;
  err.toolError = message;
  err.toolPayload = details;
  return err;
};

export const runSwMassProps = async (
  exePath,
  sldprtPath,
  { screenshot = false } = {},
  timeoutMs = 120000
) => {
  const args = [sldprtPath];
  if (screenshot) args.push("--screenshot");

  let stdout = "";
  try {
    ({ stdout } = await pExecFile(exePath, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (error) {
    stdout = error?.stdout || "";
    const parsed = parseToolJson(stdout);
    if (parsed && parsed.error) {
      throw buildSwToolError(parsed);
    }
    const execErr = new Error(
      `SW command failed${error?.message ? `: ${error.message}` : ""}`
    );
    execErr.cause = error;
    throw execErr;
  }

  const data = parseToolJson(stdout);
  if (!data) {
    const preview = stdout?.length ? stdout.slice(0, 500) : "No output.";
    throw new Error(`Bad JSON from tool: ${preview}`);
  }

  if (data.error) {
    throw buildSwToolError(data);
  }

  return data;
};
