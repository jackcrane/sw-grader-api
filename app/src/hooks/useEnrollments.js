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
    let message = "Request failed";
    let payload = null;
    try {
      payload = await response.json();
      message = payload?.message ?? message;
    } catch {
      const text = await response.text();
      message = text || message;
    }
    const error = new Error(message);
    error.status = response.status;
    if (payload && typeof payload === "object") {
      error.payload = payload;
      if (payload.error) {
        error.code = payload.error;
      }
    }
    throw error;
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
