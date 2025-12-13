import dotenv from "dotenv";
dotenv.config();

import { runSignatureTrendSweep } from "../services/signatureTrendWorker.js";

const main = async () => {
  console.log("Running signature trend sweep once...");
  await runSignatureTrendSweep();
  console.log("Trend sweep complete.");
};

main().catch((error) => {
  console.error("Trend sweep failed", error);
  process.exitCode = 1;
});
