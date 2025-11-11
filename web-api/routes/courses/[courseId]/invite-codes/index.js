import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { generateInviteCode } from "../../../../util/inviteCodes.js";

const STAFF_TYPES = ["TEACHER", "TA"];

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const { type } = req.body ?? {};
    const inviteType = (type ?? "").toLowerCase();

    if (!courseId) {
      return res.status(400).json({ message: "Course id is required" });
    }

    if (!inviteType || !["student", "ta"].includes(inviteType)) {
      return res
        .status(400)
        .json({ message: "Type must be either 'student' or 'ta'" });
    }

    const userId = req.user.localUserId ?? req.user.id;
    if (!userId) {
      return res
        .status(400)
        .json({ message: "No local user found for invite regeneration" });
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        courseId,
        userId,
        deleted: false,
        type: {
          in: STAFF_TYPES,
        },
        course: {
          deleted: false,
        },
      },
      include: {
        course: true,
      },
    });

    if (!enrollment) {
      return res.status(403).json({ message: "Not authorized for this course" });
    }

    const nextCode = await generateInviteCode(inviteType);
    const data =
      inviteType === "student"
        ? { studentInviteCode: nextCode }
        : { taInviteCode: nextCode };

    const course = await prisma.course.update({
      where: {
        id: courseId,
      },
      data,
    });

    return res.json({ course });
  },
];
