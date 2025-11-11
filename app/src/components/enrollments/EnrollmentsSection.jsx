import React, { useState } from "react";
import { Lead } from "../typography/Typography";
import { Spacer } from "../spacer/Spacer";
import { Button } from "../button/Button";
import { Row } from "../flex/Flex";
import { Spinner } from "../spinner/Spinner";
import { CreateCourseModal } from "./CreateCourseModal";
import { EnrollmentRow } from "./EnrollmentRow";
import { useAuthContext } from "../../context/AuthContext";
import { Input } from "../input/Input";

export const EnrollmentsSection = ({
  loading,
  enrollments,
  createEnrollment,
}) => {
  const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const enrollmentsList = enrollments ?? [];
  const { user } = useAuthContext();

  const handleJoinCourse = async () => {
    const trimmedCode = inviteCode.trim();
    if (!trimmedCode || !createEnrollment) return;
    setJoining(true);
    setJoinError(null);
    try {
      await createEnrollment({ inviteCode: trimmedCode });
      setInviteCode("");
    } catch (err) {
      setJoinError(err?.message ?? "Failed to join course");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <Row>
        <Spinner />
        <Lead>Enrollments loading...</Lead>
      </Row>
    );
  }

  return (
    <div>
      {enrollmentsList.length === 0 ? (
        <>
          <Lead>No enrollments</Lead>
          <Spacer />
        </>
      ) : (
        <>
          <Lead>Here are your enrollments</Lead>
          <Spacer />
          <div>
            {enrollmentsList.map((enrollment) => (
              <EnrollmentRow
                key={
                  enrollment.id ?? enrollment.courseId ?? enrollment.course?.id
                }
                enrollment={enrollment}
              />
            ))}
          </div>
        </>
      )}

      <Spacer size={3} />
      <Lead>Have an invite code?</Lead>
      <Spacer />
      <Input
        label="Enter invite code"
        value={inviteCode}
        onChange={(event) => {
          setInviteCode(event.target.value);
          if (joinError) {
            setJoinError(null);
          }
        }}
        placeholder="e.g., STU-1A2B3C"
      />
      <Spacer />
      <Button
        variant="primary"
        disabled={!inviteCode.trim() || joining}
        onClick={handleJoinCourse}
      >
        {joining ? "Joining..." : "Join course"}
      </Button>
      {joinError && (
        <p style={{ color: "#b00020", marginTop: 8 }}>{joinError}</p>
      )}

      {user.canCreateCourses && (
        <>
          <Spacer size={3} />
          <Button onClick={() => setNewCourseModalOpen(true)}>
            + Create a new course
          </Button>
          <CreateCourseModal
            open={newCourseModalOpen}
            onClose={() => setNewCourseModalOpen(false)}
            onCreateCourse={async (courseDetails) => {
              await createEnrollment?.(courseDetails);
            }}
          />
        </>
      )}
    </div>
  );
};
