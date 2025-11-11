import useSWR from "swr";
import { fetchJson } from "../utils/fetchJson";

export const useAssignmentDetails = (courseId, assignmentId) => {
  const key =
    courseId && assignmentId
      ? `/api/courses/${courseId}/assignments/${assignmentId}`
      : null;

  const { data, error, isLoading, mutate } = useSWR(key, fetchJson);

  return {
    assignment: data?.assignment ?? null,
    stats: data?.stats ?? null,
    userSubmission: data?.userSubmission ?? null,
    userSubmissions: data?.userSubmissions ?? [],
    loading: isLoading,
    error,
    refetch: mutate,
  };
};
