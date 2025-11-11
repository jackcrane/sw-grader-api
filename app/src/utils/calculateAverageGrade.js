const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
};

export const calculateAverageGrade = (assignments = [], submissions = []) => {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return null;
  }

  const submissionsByAssignment = submissions.reduce((acc, submission) => {
    if (!submission?.assignmentId) return acc;
    acc[submission.assignmentId] = submission;
    return acc;
  }, {});

  let totalEarned = 0;
  let totalPossible = 0;

  assignments.forEach((assignment) => {
    const pointsPossible = Number(assignment?.pointsPossible);
    if (!Number.isFinite(pointsPossible) || pointsPossible <= 0) {
      return;
    }

    totalPossible += pointsPossible;
    const submission = submissionsByAssignment[assignment.id];
    const numericGrade = Number(submission?.grade);
    if (!Number.isFinite(numericGrade)) {
      return;
    }

    const contribution = clamp(numericGrade, 0, pointsPossible) ?? 0;
    totalEarned += contribution;
  });

  if (totalPossible === 0) {
    return null;
  }

  return (totalEarned / totalPossible) * 100;
};
