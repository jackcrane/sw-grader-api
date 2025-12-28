import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { normalizeLatePolicyInput } from "../../../services/latePolicy.js";
import { ValidationError } from "../../../util/errors.js";
import { posthog } from "../../../util/posthog.js";
import { rescoreSubmissionsAgainstSignatures } from "../../../services/signatureTrends.js";
import { getActiveTaEnrollment } from "../../../services/courseContacts.js";

const ensureTeacherEnrollment = async (courseId, userId) => {
  if (!courseId || !userId) return null;
  return prisma.enrollment.findFirst({
    where: {
      courseId,
      userId,
      deleted: false,
      type: "TEACHER",
      course: {
        deleted: false,
      },
    },
    include: {
      course: true,
    },
  });
};

const parseContactValue = (value) => {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return undefined;
};

const parseNotificationContacts = async (courseId, payload) => {
  const buildField = async (fieldName, label) => {
    if (!payload || typeof payload !== "object") {
      return { provided: false };
    }
    if (!Object.prototype.hasOwnProperty.call(payload, fieldName)) {
      return { provided: false };
    }

    const normalized = parseContactValue(payload[fieldName]);
    if (normalized === undefined) {
      throw new ValidationError(`${label} must be blank or a teaching assistant user.`);
    }
    if (normalized === null) {
      return { provided: true, value: null };
    }

    const enrollment = await getActiveTaEnrollment({
      courseId,
      userId: normalized,
    });
    if (!enrollment) {
      throw new ValidationError(
        `${label} must reference an active teaching assistant for this course.`
      );
    }

    return { provided: true, value: normalized };
  };

  const billingField = await buildField(
    "billingContactId",
    "Billing notification contact"
  );
  const systemField = await buildField(
    "systemContactId",
    "System notification contact"
  );

  return {
    billingContactProvided: billingField.provided,
    billingContactId: billingField.value ?? null,
    systemContactProvided: systemField.provided,
    systemContactId: systemField.value ?? null,
  };
};

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!enrollment) {
      return res
        .status(403)
        .json({ error: "Only teachers can update course settings." });
    }

    const latePolicyInput =
      req.body && typeof req.body.latePolicy === "object"
        ? req.body.latePolicy
        : null;
    const notificationPayload =
      req.body && typeof req.body.notificationContacts === "object"
        ? req.body.notificationContacts
        : null;

    let normalizedPolicy = null;
    let parsedContacts = {
      billingContactProvided: false,
      systemContactProvided: false,
    };

    try {
      if (latePolicyInput) {
        normalizedPolicy = normalizeLatePolicyInput(latePolicyInput);
      }
      parsedContacts = await parseNotificationContacts(
        courseId,
        notificationPayload
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const course = await prisma.course.findFirst({
      where: { id: courseId, deleted: false },
    });
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const updateData = {};
    if (normalizedPolicy) {
      updateData.latePolicyAllowLateSubmissions =
        normalizedPolicy.allowLateSubmissions;
      updateData.latePolicyMaxLatenessMinutes =
        normalizedPolicy.maxLatenessMinutes;
      updateData.latePolicyPenaltyPercent = normalizedPolicy.penaltyPercent;
      updateData.latePolicyPenaltyType = normalizedPolicy.penaltyPercent
        ? normalizedPolicy.penaltyType
        : null;
    }

    if (parsedContacts.billingContactProvided) {
      updateData.primaryBillingContactUserId =
        parsedContacts.billingContactId;
    }
    if (parsedContacts.systemContactProvided) {
      updateData.primarySystemContactUserId = parsedContacts.systemContactId;
    }

    if (!Object.keys(updateData).length) {
      return res
        .status(400)
        .json({ error: "No updates were provided for this course." });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: updateData,
    });

    if (normalizedPolicy) {
      const inheritingAssignments = await prisma.assignment.findMany({
        where: {
          deleted: false,
          courseId,
          latePolicyInheritFromCourse: true,
        },
        select: {
          id: true,
        },
      });

      Promise.resolve()
        .then(() =>
          Promise.allSettled(
            inheritingAssignments.map(({ id }) =>
              rescoreSubmissionsAgainstSignatures({
                assignmentId: id,
                courseId,
              }).catch((err) => {
                console.warn(
                  `Failed to rescore assignment ${id} after course policy update`,
                  err
                );
              })
            )
          )
        )
        .catch((error) => {
          console.warn(
            `Failed to schedule rescoring for course ${courseId}`,
            error
          );
        });

      posthog.capture({
        distinctId: userId,
        event: "course late policy updated",
        properties: {
          courseId,
          allowLateSubmissions: normalizedPolicy.allowLateSubmissions,
          maxLatenessMinutes: normalizedPolicy.maxLatenessMinutes,
          penaltyPercent: normalizedPolicy.penaltyPercent,
          penaltyType: normalizedPolicy.penaltyPercent
            ? normalizedPolicy.penaltyType
            : null,
        },
      });
    }

    if (
      parsedContacts.billingContactProvided ||
      parsedContacts.systemContactProvided
    ) {
      posthog.capture({
        distinctId: userId,
        event: "course notification contacts updated",
        properties: {
          courseId,
          billingContactId:
            updatedCourse.primaryBillingContactUserId ?? null,
          systemContactId: updatedCourse.primarySystemContactUserId ?? null,
          billingContactUpdated: parsedContacts.billingContactProvided,
          systemContactUpdated: parsedContacts.systemContactProvided,
        },
      });
    }

    return res.json({ course: updatedCourse });
  },
];
