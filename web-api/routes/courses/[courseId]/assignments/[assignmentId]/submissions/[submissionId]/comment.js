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

const formatRecipientName = (user) => {
  if (!user) return "there";
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length === 0) return "there";
  return parts.join(" ");
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
    if (![
      "TEACHER",
      "TA",
    ].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only staff can comment on submissions." });
    }

    const submission = await fetchSubmission(
      submissionId,
      assignmentId,
      courseId
    );
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }

    const commentInput = req.body?.comment;
    if (typeof commentInput !== "string") {
      return res.status(400).json({ error: "Comment must be a string." });
    }
    const normalizedComment = commentInput.trim();
    if (!normalizedComment) {
      return res.status(400).json({ error: "Comment cannot be empty." });
    }

    await prisma.$executeRaw`
      UPDATE "Submission"
      SET "staffComment" = ${normalizedComment}
      WHERE "id" = ${submission.id}
    `;

    const updatedSubmission = await prisma.submission.findFirst({
      where: {
        id: submission.id,
        deleted: false,
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
          },
        },
      },
    });

    if (!updatedSubmission) {
      return res.status(404).json({ error: "Submission not found." });
    }

    const recipientEmail = updatedSubmission?.user?.email;
    if (recipientEmail) {
      const assignmentName =
        updatedSubmission?.assignment?.name ?? "assignment";
      const recipientName = formatRecipientName(updatedSubmission?.user);
      const subject = `New comment on your submission for ${assignmentName}`;
      const text = `Hi ${recipientName},\n\nThere is a new comment on your submission for ${assignmentName} on FeatureBench. Log in to see what it was!\n\nThanks,\nThe FeatureBench team`;

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
