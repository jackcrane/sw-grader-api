import useSWR from "swr";
import { fetchJson } from "../utils/fetchJson";

const postJson = (url, body) =>
  fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

export const useAssignments = (courseId) => {
  const key = courseId ? `/api/courses/${courseId}/assignments` : null;
  const { data, error, isLoading, mutate } = useSWR(key, fetchJson);

  const createAssignment = async (payload) => {
    if (!courseId) {
      throw new Error("courseId is required to create an assignment");
    }

    const createdAssignment = await postJson(
      `/api/courses/${courseId}/assignments`,
      payload
    );
    await mutate();
    return createdAssignment;
  };

  const updateAssignment = async (assignmentId, payload) => {
    if (!courseId) {
      throw new Error("courseId is required to update an assignment");
    }
    if (!assignmentId) {
      throw new Error("assignmentId is required to update an assignment");
    }

    const updatedAssignment = await fetchJson(
      `/api/courses/${courseId}/assignments/${assignmentId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    await mutate();
    return updatedAssignment;
  };

  return {
    assignments: data,
    loading: isLoading,
    error,
    refetch: mutate,
    createAssignment,
    updateAssignment,
  };
};
