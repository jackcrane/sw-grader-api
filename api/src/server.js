import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runSwMassProps } from "./swRunner.js";
import { convertFromSI, normalizeUnitSystem } from "./units.js";
import { downloadObject, deleteObject } from "./s3Client.js";
import { startQueueWorker } from "./graderQueueWorker.js";
import { reportGraderResult } from "./reportResults.js";

const app = express();

const SW_MASS_EXE = process.env.SW_MASS_EXE;
if (!SW_MASS_EXE)
  throw new Error(
    "Missing SW_MASS_EXE env var pointing to SwMassPropsJson.exe"
  );

const uploadDir = path.resolve("uploads");
await fs.mkdir(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = /\.sldprt$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .sldprt files are allowed"), ok);
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

let analysisChain = Promise.resolve();

const enqueueExclusiveAnalysis = (task) => {
  const run = analysisChain.then(task, task);
  analysisChain = run.catch(() => {});
  return run;
};

const analyzeFile = async (
  filePath,
  unitSystem = "mks",
  { screenshot = false } = {}
) => {
  const normalizedUnitSystem = normalizeUnitSystem(unitSystem);
  const result = await runSwMassProps(SW_MASS_EXE, filePath, { screenshot });
  return convertFromSI(result, normalizedUnitSystem);
};

const writeBufferToTempFile = async (
  buffer,
  filenameHint = "submission.sldprt"
) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-job-"));
  const sanitizedName =
    filenameHint.replace(/[^\w.\-]/g, "") || "submission.sldprt";
  const filePath = path.join(dir, sanitizedName);
  await fs.writeFile(filePath, buffer);
  return { dir, filePath };
};

const withJobFile = async (job, runner) => {
  if (!job?.fileKey) {
    throw new Error("Job is missing file metadata.");
  }
  const fileBuffer = await downloadObject(job.fileKey);
  if (!fileBuffer) {
    throw new Error("Unable to download submission file from S3.");
  }

  const filenameHint =
    job.fileName ||
    (job.submissionId ? `submission-${job.submissionId}.sldprt` : null) ||
    "submission.sldprt";
  const { dir, filePath } = await writeBufferToTempFile(fileBuffer, filenameHint);
  try {
    return await runner(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

const fatalSwErrorCodes = new Set([5, 6]);

const isFatalSwError = (error) => {
  if (!error || typeof error !== "object") return false;
  if (!error.isSwToolError) return false;
  const code = Number(error.code);
  return Number.isFinite(code) && fatalSwErrorCodes.has(code);
};

const buildFatalSwErrorMessage = (error) => {
  const rawMessage =
    typeof error?.toolError === "string"
      ? error.toolError
      : typeof error?.message === "string"
      ? error.message
      : "";
  const cleaned = rawMessage.replace(/^SW tool error:\s*/i, "").trim();
  const openMatch = cleaned.match(/Open failed\s*\((\d+)\)/i);
  if (openMatch) {
    const errCode = openMatch[1];
    return `SolidWorks could not open this part file (error ${errCode}). Save it in an older SolidWorks version (e.g., 2024 or earlier) and resubmit.`;
  }
  return (
    cleaned ||
    "SolidWorks could not process this part file. Please verify it opens locally and resubmit."
  );
};

const handleFatalSwError = async (job, error) => {
  if (!isFatalSwError(error)) return false;
  const message = buildFatalSwErrorMessage(error);
  console.warn(
    `[grader] Fatal SolidWorks error for submission ${job.submissionId}: ${message}`
  );
  await reportGraderResult({
    submissionId: job.submissionId,
    error: message,
  });
  console.warn(
    `[grader] Reported failure for submission ${job.submissionId}; skipping requeue`
  );
  return true;
};

const processSubmissionJob = async (job) => {
  try {
    const analysis = await withJobFile(job, async (filePath) => {
      console.log(
        `[grader] Running SolidWorks for submission ${job.submissionId}`
      );
      const result = await enqueueExclusiveAnalysis(() =>
        analyzeFile(filePath, job.unitSystem || "mks", { screenshot: true })
      );
      console.log(
        `[grader] Analysis complete for ${job.submissionId} (volume=${result.volume}, surfaceArea=${result.surfaceArea})`
      );
      return result;
    });

    await reportGraderResult({
      submissionId: job.submissionId,
      volume: analysis.volume,
      surfaceArea: analysis.surfaceArea,
      screenshot: analysis.screenshot ?? analysis.screenshotB64 ?? null,
    });
    console.log(
      `[grader] Reported results for submission ${job.submissionId}`
    );
  } catch (error) {
    const handled = await handleFatalSwError(job, error);
    if (!handled) {
      throw error;
    }
  }
};

const isAnalyzerJob = (job) => job?.type === "prescan";

const processAnalyzeJob = async (job) => {
  const jobLabel = job?.jobId || job?.fileKey || "analyzer-job";
  try {
    const analysis = await withJobFile(job, async (filePath) => {
      console.log(`[grader] Running analyzer job ${jobLabel}`);
      return enqueueExclusiveAnalysis(() =>
        analyzeFile(filePath, job.unitSystem || "mks", { screenshot: true })
      );
    });
    console.log(
      `[grader] Analyzer job ${jobLabel} complete (volume=${analysis.volume}, surfaceArea=${analysis.surfaceArea})`
    );
    return {
      ok: true,
      jobId: job?.jobId ?? null,
      result: {
        ...analysis,
        screenshotB64: analysis.screenshot ?? analysis.screenshotB64 ?? null,
      },
    };
  } catch (error) {
    const message = isFatalSwError(error)
      ? buildFatalSwErrorMessage(error)
      : error?.message || "Unable to analyze part file.";
    console.error(`[grader] Analyzer job ${jobLabel} failed`, error);
    return {
      ok: false,
      jobId: job?.jobId ?? null,
      error: message,
    };
  } finally {
    if (job?.cleanupKey) {
      await deleteObject(job.cleanupKey).catch((err) => {
        console.warn(
          `[grader] Failed to delete analyzer artifact ${job.cleanupKey}`,
          err
        );
      });
    }
  }
};

startQueueWorker(async (job) => {
  if (isAnalyzerJob(job)) {
    return processAnalyzeJob(job);
  }
  return processSubmissionJob(job);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.get("/", (_req, res) => {
  res.type("html").send(`
    <form action="/analyze" method="post" enctype="multipart/form-data">
      <input type="file" name="file" accept=".sldprt" />
      <label>unitSystem:
        <select name="unitSystem">
          <option value="mks">mks (SI)</option>
          <option value="mmgs">mmgs</option>
          <option value="cgs">cgs</option>
          <option value="ips">ips</option>
        </select>
      </label>
      <label>include screenshot:
        <input type="checkbox" name="screenshot" value="true" />
      </label>
      <button type="submit">Upload</button>
    </form>
    <p>Or POST /analyze?unitSystem=ips&screenshot=true with multipart 'file'.</p>
  `);
});

app.post("/analyze", upload.single("file"), async (req, res) => {
  const unitSystem = normalizeUnitSystem(
    req.query.unitSystem ?? req.body?.unitSystem
  );
  const screenshotReq = req.query.screenshot ?? req.body?.screenshot ?? "false";
  const screenshot = String(screenshotReq).toLowerCase() === "true";

  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded (field 'file' must contain a .sldprt)",
    });
  }

  const filePath = req.file.path;

  try {
    console.log(
      `[http] /analyze request (${req.file.originalname}) unitSystem=${unitSystem}`
    );
    const out = await enqueueExclusiveAnalysis(() =>
      analyzeFile(filePath, unitSystem, { screenshot })
    );
    await safeUnlink(filePath);
    console.log(
      `[http] Completed /analyze for ${req.file.originalname} (volume=${out.volume}, surfaceArea=${out.surfaceArea})`
    );
    return res.json(out);
  } catch (err) {
    console.error("[http] /analyze failed", err);
    await safeUnlink(filePath);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

const safeUnlink = async (p) => {
  try {
    await fs.unlink(p);
  } catch {}
};

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`SW mass API listening on http://localhost:${PORT}`);
});
