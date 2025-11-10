import useSWR from "swr";

export const useEnrollments = () => {
  const { data, error, isLoading, mutate } = useSWR("/api/enrollments");

  return {
    enrollments: data,
    loading: isLoading,
    error,
    refetch: mutate,
  };
};
