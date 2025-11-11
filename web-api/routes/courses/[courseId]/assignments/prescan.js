import multer from "multer";
import { withAuth } from "#withAuth";
import { analyzePart } from "../../../../services/analyzerClient.js";
import { isGraderOnline } from "../../../../services/graderHealth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB safety ceiling
  },
});

const ALLOWED_UNIT_SYSTEMS = new Set(["SI", "MMGS", "CGS", "IPS"]);

export const post = [
  withAuth,
  upload.single("file"),
  async (req, res) => {
    const { unitSystem } = req.query;
    const { file } = req;

    if (!unitSystem || !ALLOWED_UNIT_SYSTEMS.has(unitSystem)) {
      return res
        .status(400)
        .json({ error: "A valid unit system is required for prescan." });
    }

    if (!file) {
      return res.status(400).json({ error: "Missing part file upload." });
    }

    if (!file.originalname?.toLowerCase?.().endsWith(".sldprt")) {
      return res
        .status(400)
        .json({ error: "Only .sldprt files can be prescanned." });
    }

    if (!isGraderOnline()) {
      return res.status(503).json({
        error: "The grader is offline. Try again once it comes back online.",
      });
    }

    try {
      const analysis = await analyzePart({
        fileBuffer: file.buffer,
        filename: file.originalname || "signature.sldprt",
        mimeType: file.mimetype || "application/octet-stream",
        unitSystem,
      });

      return res.status(200).json(analysis);
    } catch (error) {
      console.error("Prescan forward failed", error);
      return res
        .status(502)
        .json({ error: "Unable to forward file for analysis." });
    }
  },
];
