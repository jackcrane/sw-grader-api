import { prisma } from "#prisma";
import { checkSignatureTrendsForAssignment } from "./signatureTrends.js";

const TREND_INTERVAL_MS = 10 * 60 * 1000;

let intervalHandle = null;
let running = false;

const runSweep = async () => {
  if (running) return;
  running = true;
  try {
    const assignments = await prisma.submission.findMany({
      where: {
        deleted: false,
        volume: { not: null },
        surfaceArea: { not: null },
      },
      select: {
        assignmentId: true,
        courseId: true,
      },
      distinct: ["assignmentId"],
    });

    for (const entry of assignments) {
      if (!entry.assignmentId) continue;
      await checkSignatureTrendsForAssignment({
        assignmentId: entry.assignmentId,
        courseId: entry.courseId ?? null,
      }).catch((error) =>
        console.warn(
          `Trend sweep failed for assignment ${entry.assignmentId}`,
          error
        )
      );
    }
  } catch (error) {
    console.warn("Signature trend sweep failed", error);
  } finally {
    running = false;
  }
};

export const runSignatureTrendSweep = async () => runSweep();

export const startSignatureTrendWorker = () => {
  if (intervalHandle) return;
  runSweep();
  intervalHandle = setInterval(runSweep, TREND_INTERVAL_MS);
};
