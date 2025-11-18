import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runSwMassProps } from "./swRunner.js";
import { convertFromSI, normalizeUnitSystem } from "./units.js";
import { downloadObject } from "./s3Client.js";
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

const writeBufferToTempFile = async (buffer, filenameHint = "submission.sldprt") => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-job-"));
  const sanitizedName = filenameHint.replace(/[^\w.\-]/g, "") || "submission.sldprt";
  const filePath = path.join(dir, sanitizedName);
  await fs.writeFile(filePath, buffer);
  return { dir, filePath };
};

const processQueueJob = async (job) => {
  const fileBuffer = await downloadObject(job.fileKey);
  if (!fileBuffer) {
    throw new Error("Unable to download submission file from S3.");
  }

  const { dir, filePath } = await writeBufferToTempFile(
    fileBuffer,
    job.fileName || `submission-${job.submissionId}.sldprt`
  );

  try {
    console.log(
      `[grader] Running SolidWorks for submission ${job.submissionId}`
    );
    const analysis = await enqueueExclusiveAnalysis(() =>
      analyzeFile(filePath, job.unitSystem || "mks", { screenshot: true })
    );
    console.log(
      `[grader] Analysis complete for ${job.submissionId} (volume=${analysis.volume}, surfaceArea=${analysis.surfaceArea})`
    );
    await reportGraderResult({
      submissionId: job.submissionId,
      volume: analysis.volume,
      surfaceArea: analysis.surfaceArea,
      screenshot: analysis.screenshot ?? analysis.screenshotB64 ?? null,
    });
    console.log(
      `[grader] Reported results for submission ${job.submissionId}`
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

startQueueWorker(async (job) => {
  await processQueueJob(job);
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
