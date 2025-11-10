import useSWR from "swr";

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  return response.json();
};

export const useEnrollments = ({ enabled = true } = {}) => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "/api/enrollments" : null
  );

  const createEnrollment = async (payload) => {
    const createdEnrollment = await postJson("/api/enrollments", payload);
    await mutate();
    return createdEnrollment;
  };

  return {
    enrollments: data,
    loading: isLoading,
    error,
    refetch: mutate,
    createEnrollment,
  };
};
