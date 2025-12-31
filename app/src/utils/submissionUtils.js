export const sortSubmissionsByTimestamp = (items = [], { descending = false } = {}) => {
  const sorted = (items || [])
    .map((submission) => ({
      ...submission,
      sortTimestamp: submission?.updatedAt ?? submission?.createdAt ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.sortTimestamp ? new Date(a.sortTimestamp).getTime() : 0;
      const bTime = b.sortTimestamp ? new Date(b.sortTimestamp).getTime() : 0;
      return aTime - bTime;
    });
  if (descending) {
    return sorted.reverse();
  }
  return sorted;
};

export const findSubmissionIndexById = (submissions = [], submissionId) => {
  if (!submissionId) return -1;
  const targetId = String(submissionId);
  return submissions.findIndex((submission) => String(submission?.id) === targetId);
};
