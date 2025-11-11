import multer from "multer";
import { withAuth } from "#withAuth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB safety ceiling
  },
});

const ALLOWED_UNIT_SYSTEMS = new Set(["SI", "MMGS", "CGS", "IPS"]);
const ANALYZE_ENDPOINT = "https://jack-pc.jackcrane.rocks/analyze";

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

    try {
      const endpoint = new URL(ANALYZE_ENDPOINT);
      endpoint.searchParams.set("unitSystem", unitSystem);
      endpoint.searchParams.set("screenshot", "true");

      const formData = new FormData();
      const blob = new Blob([file.buffer], {
        type: file.mimetype || "application/octet-stream",
      });
      formData.append("file", blob, file.originalname);

      const upstreamResponse = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const responseBuffer = Buffer.from(
        await upstreamResponse.arrayBuffer()
      );
      const contentType = upstreamResponse.headers.get("content-type");

      res.status(upstreamResponse.status);
      if (contentType) {
        res.setHeader("content-type", contentType);
      }

      return res.send(responseBuffer);
    } catch (error) {
      console.error("Prescan forward failed", error);
      return res
        .status(502)
        .json({ error: "Unable to forward file for analysis." });
    }
  },
];
