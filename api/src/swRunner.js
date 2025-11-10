import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

export const runSwMassProps = async (
  exePath,
  sldprtPath,
  { screenshot = false } = {},
  timeoutMs = 120000
) => {
  const args = [sldprtPath];
  if (screenshot) args.push("--screenshot");

  const { stdout } = await pExecFile(exePath, args, {
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  let data;
  try {
    data = JSON.parse(stdout.trim());
  } catch (e) {
    const msg = stdout.length
      ? `Bad JSON from tool: ${stdout.slice(0, 500)}`
      : "No output from tool.";
    throw new Error(msg);
  }

  if (data && data.error) {
    const err = new Error(`SW tool error: ${data.error}`);
    err.code = data.code ?? 1;
    throw err;
  }

  return data;
};
