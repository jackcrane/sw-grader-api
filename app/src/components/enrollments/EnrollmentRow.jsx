import React from "react";
import { Link } from "react-router-dom";
import { Row } from "../flex/Flex";
import styles from "./EnrollmentRow.module.css";

export const EnrollmentRow = ({ enrollment }) => {
  const courseName =
    enrollment.course?.name ?? enrollment.courseName ?? "Untitled course";
  const courseAbbr = enrollment.course?.abbr ?? enrollment.courseAbbr ?? null;
  const typeLabel = enrollment.type ? enrollment.type.toLowerCase() : null;
  const courseId = enrollment.course?.id ?? enrollment.courseId ?? null;

  const rowBody = (
    <Row justify="space-between" align="center">
      <div data-cy={`enrollment-row-${courseName}-${courseAbbr}`}>
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
          data-cy={`enrollment-type-${courseName}-${typeLabel}`}
        >
          {typeLabel}
        </div>
      )}
    </Row>
  );

  if (!courseId) {
    return (
      <div className={styles.row} aria-disabled="true">
        {rowBody}
      </div>
    );
  }

  return (
    <Link to={`/${courseId}`} className={styles.row}>
      {rowBody}
    </Link>
  );
};
