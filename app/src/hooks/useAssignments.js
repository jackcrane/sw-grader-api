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

  return {
    assignments: data,
    loading: isLoading,
    error,
    refetch: mutate,
    createAssignment,
  };
};
