import { parseGradeValue } from "./gradeUtils";

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
};

const isGradeSet = (grade) => grade !== null && grade !== undefined;

export const calculateAverageGrade = (assignments = [], submissions = []) => {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;

  const now = new Date();

  // latest submission per assignmentId by updatedAt
  const submissionsByAssignment = submissions.reduce((acc, s) => {
    const aid = s?.assignmentId;
    if (!aid) return acc;

    const prev = acc[aid];
    if (!prev) {
      acc[aid] = s;
      return acc;
    }

    const prevT = prev?.updatedAt
      ? new Date(prev.updatedAt).getTime()
      : -Infinity;
    const nextT = s?.updatedAt ? new Date(s.updatedAt).getTime() : -Infinity;

    if (nextT >= prevT) acc[aid] = s;
    return acc;
  }, {});

  let totalEarned = 0;
  let totalPossible = 0;

  assignments.forEach((a) => {
    const pointsPossible = Number(a?.pointsPossible);
    if (!Number.isFinite(pointsPossible) || pointsPossible <= 0) return;

    const due = a?.dueDate ? new Date(a.dueDate) : null;
    const isPastDue = due ? due.getTime() <= now.getTime() : false;

    const submission = submissionsByAssignment[a.id];
    const gradeRaw = submission?.grade;

    const includeThis = isPastDue || isGradeSet(gradeRaw); // <-- key rule

    if (!includeThis) return;

    totalPossible += pointsPossible;

    // past-due missing (or not set) => 0
    if (!isGradeSet(gradeRaw)) return;

    const numericGrade = parseGradeValue(gradeRaw);
    if (numericGrade == null) return;

    totalEarned += clamp(numericGrade, 0, pointsPossible) ?? 0;
  });

  if (totalPossible === 0) return null;
  return (totalEarned / totalPossible) * 100;
};
