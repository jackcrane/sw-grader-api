import { prisma } from "#prisma";
import { getQueueMetrics } from "./graderQueue.js";

const readSubmissionTimestamps = async (submissionId) => {
  if (!submissionId) return null;
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      deleted: false,
    },
    select: {
      createdAt: true,
      grade: true,
    },
  });
};

export const computeSubmissionQueuePosition = async ({
  submissionId,
  createdAt,
  grade,
} = {}) => {
  const existing =
    (!createdAt || grade == null) && submissionId
      ? await readSubmissionTimestamps(submissionId)
      : null;

  const targetCreatedAt = createdAt ?? existing?.createdAt ?? null;
  const targetGrade =
    grade !== undefined ? grade : existing?.grade ?? null;

  if (!targetCreatedAt) {
    return null;
  }

  if (targetGrade != null) {
    return {
      aheadCount: 0,
      position: 0,
      queueSize: getQueueMetrics().totalPending,
    };
  }

  const aheadWhere = {
    deleted: false,
    grade: null,
    OR: [
      {
        createdAt: {
          lt: targetCreatedAt,
        },
      },
    ],
  };

  if (submissionId) {
    aheadWhere.OR.push({
      createdAt: targetCreatedAt,
      id: {
        lt: submissionId,
      },
    });
  }

  const aheadCount = await prisma.submission.count({
    where: aheadWhere,
  });
  const position = aheadCount + 1;
  const metrics = getQueueMetrics();
  const queueSize = Math.max(position, metrics.totalPending);
  return {
    aheadCount,
    position,
    queueSize,
  };
};
