import useSWR from "swr";
import { fetchJson } from "../utils/fetchJson";

const withJson = (url, method, body) =>
  fetchJson(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

export const useCourseRoster = (courseId, { enabled = true } = {}) => {
  const key = courseId && enabled ? `/api/courses/${courseId}/roster` : null;
  const { data, error, isLoading, mutate } = useSWR(key, fetchJson);

  const updateEnrollmentType = async (enrollmentId, nextType) => {
    if (!courseId || !enrollmentId || !nextType) {
      throw new Error("courseId, enrollmentId, and nextType are required");
    }

    await withJson(
      `/api/courses/${courseId}/roster/${enrollmentId}`,
      "PATCH",
      { type: nextType }
    );
    await mutate();
  };

  const removeEnrollment = async (enrollmentId) => {
    if (!courseId || !enrollmentId) {
      throw new Error("courseId and enrollmentId are required");
    }

    await fetchJson(`/api/courses/${courseId}/roster/${enrollmentId}`, {
      method: "DELETE",
    });
    await mutate();
  };

  return {
    roster: data?.roster ?? [],
    assignments: data?.assignments ?? [],
    loading: isLoading,
    error,
    refetch: mutate,
    updateEnrollmentType,
    removeEnrollment,
  };
};
