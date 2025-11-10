import React from "react";
import { Row } from "../flex/Flex";
import styles from "./EnrollmentRow.module.css";

export const EnrollmentRow = ({ enrollment }) => {
  const courseName =
    enrollment.course?.name ?? enrollment.courseName ?? "Untitled course";
  const courseAbbr = enrollment.course?.abbr ?? enrollment.courseAbbr ?? null;
  const typeLabel = enrollment.type ? enrollment.type.toLowerCase() : null;
  const courseId = enrollment.course?.id ?? enrollment.courseId ?? null;

  return (
    <a
      href={courseId ? `/${courseId}` : undefined}
      className={styles.row}
      aria-disabled={!courseId}
    >
      <Row justify="space-between" align="center">
        <div>
          <div style={{ fontWeight: 600 }}>{courseName}</div>
          {courseAbbr && (
            <div style={{ fontSize: 12, color: "#555" }}>{courseAbbr}</div>
          )}
        </div>
        {typeLabel && (
          <div
            style={{
              fontSize: 12,
              textTransform: "capitalize",
              color: "#555",
            }}
          >
            {typeLabel}
          </div>
        )}
      </Row>
    </a>
  );
};
