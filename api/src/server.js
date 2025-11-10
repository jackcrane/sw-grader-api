import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { runSwMassProps } from "./swRunner.js";
import { convertFromSI, normalizeUnitSystem } from "./units.js";

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
    // Run the C# tool (SI), optionally with screenshot
    const si = await runSwMassProps(SW_MASS_EXE, filePath, { screenshot });

    // Convert to requested units; pass through screenshot/screenshotError fields
    const out = convertFromSI(si, unitSystem);

    await safeUnlink(filePath);
    return res.json(out);
  } catch (err) {
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
