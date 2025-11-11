import React, { useEffect, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { Card } from "../../components/card/Card";
import { Spacer } from "../../components/spacer/Spacer";
import { H2 } from "../../components/typography/Typography";
import { Button } from "../../components/button/Button";

const maskCode = (value) => {
  if (!value) return "";
  return "•".repeat(Math.max(value.length, 8));
};

const smallButtonStyle = {
  padding: "4px 12px",
  fontSize: 12,
  minHeight: 0,
};

export const CourseDetails = () => {
  const {
    courseId,
    enrollment,
    regenerateInviteCode,
    hasStaffPrivileges,
  } = useOutletContext();
  const course = enrollment?.course ?? {};
  const isStaff =
    typeof hasStaffPrivileges === "boolean"
      ? hasStaffPrivileges
      : ["TEACHER", "TA"].includes(enrollment?.type ?? "");
  const [studentVisible, setStudentVisible] = useState(false);
  const [taVisible, setTaVisible] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [taLoading, setTaLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isStaff) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  useEffect(() => {
    setStudentVisible(false);
  }, [course.studentInviteCode]);

  useEffect(() => {
    setTaVisible(false);
  }, [course.taInviteCode]);

  const handleRegenerate = async (inviteType) => {
    if (!regenerateInviteCode) return;
    setError(null);
    const setLoading = inviteType === "student" ? setStudentLoading : setTaLoading;
    const setVisible = inviteType === "student" ? setStudentVisible : setTaVisible;
    setLoading(true);
    try {
      await regenerateInviteCode(inviteType);
      setVisible(false);
    } catch (err) {
      setError(err?.message ?? "Failed to regenerate invite code");
    } finally {
      setLoading(false);
    }
  };

  const hasInviteCodes = course.studentInviteCode || course.taInviteCode;

  return (
    <div style={{ padding: 16 }}>
      <H2>Course details</H2>
      <p style={{ color: "#555" }}>
        Reference the course metadata and invite codes at any time.
      </p>
      <Spacer />
      <Card>
        <div style={{ marginBottom: 12 }}>
          <strong>Course name</strong>
          <p style={{ margin: "4px 0 0", color: "#333" }}>{course.name}</p>
        </div>
        <div>
          <strong>Abbreviation</strong>
          <p style={{ margin: "4px 0 0", color: "#333" }}>{course.abbr}</p>
        </div>
      </Card>
      {hasInviteCodes ? (
        <>
          <Spacer size={2} />
          <Card>
            <div style={{ marginBottom: 12 }}>
              <strong>Invite codes</strong>
              <p style={{ margin: "4px 0 0", color: "#555" }}>
                Share the appropriate code depending on the role of the person
                joining the course.
              </p>
            </div>
            {course.studentInviteCode && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    color: "#777",
                  }}
                >
                  Student code
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <code style={{ fontSize: 16 }}>
                    {studentVisible
                      ? course.studentInviteCode
                      : maskCode(course.studentInviteCode)}
                  </code>
                  <Button
                    onClick={() => setStudentVisible((prev) => !prev)}
                    style={smallButtonStyle}
                  >
                    {studentVisible ? "Hide" : "Show"}
                  </Button>
                  <Button
                    onClick={() => handleRegenerate("student")}
                    disabled={studentLoading}
                    style={smallButtonStyle}
                  >
                    {studentLoading ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
              </div>
            )}
            {course.taInviteCode && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    color: "#777",
                  }}
                >
                  TA / instructor code
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <code style={{ fontSize: 16 }}>
                    {taVisible ? course.taInviteCode : maskCode(course.taInviteCode)}
                  </code>
                  <Button
                    onClick={() => setTaVisible((prev) => !prev)}
                    style={smallButtonStyle}
                  >
                    {taVisible ? "Hide" : "Show"}
                  </Button>
                  <Button
                    onClick={() => handleRegenerate("ta")}
                    disabled={taLoading}
                    style={smallButtonStyle}
                  >
                    {taLoading ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <Spacer size={2} />
          <Card>
            <p style={{ margin: 0, color: "#555" }}>
              Invite codes will appear here once they are generated for this
              course.
            </p>
          </Card>
        </>
      )}
      {error && (
        <>
          <Spacer />
          <p style={{ color: "#b00020" }}>{error}</p>
        </>
      )}
    </div>
  );
};
