import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { withSignedAssetUrls } from "../../../../../../../util/submissionAssets.js";
import { sendEmail } from "../../../../../../../util/postmark.js";

const ensureEnrollment = async (userId, courseId) => {
  if (!userId || !courseId) {
    return null;
  }
  return prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      deleted: false,
      course: {
        deleted: false,
      },
    },
  });
};

const fetchSubmission = async (submissionId, assignmentId, courseId = null) => {
  if (!submissionId || !assignmentId) return null;
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      assignmentId,
      deleted: false,
      ...(courseId ? { courseId } : {}),
    },
  });
};

const parseGradeValue = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return null;
  return numeric;
};

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId, assignmentId, submissionId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    if (!courseId || !assignmentId || !submissionId) {
      return res
        .status(400)
        .json({ error: "Course, assignment, and submission are required." });
    }

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }
    if (!["TEACHER", "TA"].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only staff can override submission grades." });
    }

    const submission = await fetchSubmission(submissionId, assignmentId, courseId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }

    const gradeInput = req.body?.grade;
    const normalizedGrade = parseGradeValue(gradeInput);
    if (normalizedGrade == null) {
      return res.status(400).json({
        error: "Grade must be a non-negative number.",
      });
    }

    let autoGradeValue = submission.autoGrade ?? null;
    if (autoGradeValue == null && submission.grade != null) {
      autoGradeValue = submission.grade;
    }

    const shouldCaptureAutoGrade = autoGradeValue != null;

    const updatedSubmission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        grade: normalizedGrade,
        unpenalizedGrade: normalizedGrade,
        manuallyGraded: true,
        ...(shouldCaptureAutoGrade ? { autoGrade: autoGradeValue } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        assignment: {
          select: {
            id: true,
            name: true,
            course: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const recipientEmail = updatedSubmission?.user?.email;
    if (recipientEmail) {
      const userNameParts = [
        updatedSubmission?.user?.firstName,
        updatedSubmission?.user?.lastName,
      ].filter(Boolean);
      const recipientName =
        userNameParts.length > 0 ? userNameParts.join(" ") : null;
      const assignmentName =
        updatedSubmission?.assignment?.name ?? "assignment";
      const courseName = updatedSubmission?.assignment?.course?.name ?? null;
      const staffLabel =
        enrollment.type === "TEACHER" ? "Teacher" : "Teaching assistant";
      const greeting = recipientName ? `Hello ${recipientName},` : "Hello,";
      const courseSegment = courseName ? ` in ${courseName}` : "";
      const subject = `Grade update for ${assignmentName}`;
      const text = `${greeting}\n\nA ${staffLabel} manually updated the score for ${assignmentName}${courseSegment}. Please revisit the assignment to see the latest feedback or comments.\n\nBest,\nFeatureBench`;

      await sendEmail({
        to: recipientEmail,
        subject,
        text,
      });
    }

    const submissionWithUrls = await withSignedAssetUrls(updatedSubmission);
    return res.status(200).json({ submission: submissionWithUrls });
  },
];
