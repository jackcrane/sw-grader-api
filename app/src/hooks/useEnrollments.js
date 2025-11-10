import useSWR from "swr";

export const useEnrollments = () => {
  const key = `/api/enrollments`;

  const { data, error, isLoading, mutate } = useSWR(key);

  return {
    enrollments: data,
    loading: isLoading,
    error,
    refetch: mutate,
  };
};
