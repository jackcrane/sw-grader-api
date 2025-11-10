import useSWR from "swr";
import useSWRMutation from "swr/mutation";

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
    ...init,
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed");
    error.status = response.status;
    error.info = payload;
    throw error;
  }

  return payload;
};

const sessionFetcher = (url) => fetchJson(url);

export const useAuth = () => {
  const {
    data,
    error,
    isLoading,
    mutate: refreshSession,
  } = useSWR("/api/auth/session", sessionFetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  const { trigger: startLogin, isMutating: isLoggingIn } = useSWRMutation(
    "/api/auth/login",
    (url) =>
      fetchJson(url).then(({ authorizationUrl }) => {
        if (authorizationUrl) {
          window.location.href = authorizationUrl;
        }
      })
  );

  const { trigger: startLogout, isMutating: isLoggingOut } = useSWRMutation(
    "/api/auth/logout",
    (url) =>
      fetchJson(url, { method: "POST" }).then((payload) => {
        refreshSession(null, { revalidate: false });

        if (payload?.redirect) {
          window.location.href = payload.redirect;
        }
      })
  );

  const user = data?.user ?? null;

  return {
    user,
    isLoading,
    error,
    isAuthenticated: Boolean(data?.authenticated),
    login: startLogin,
    logout: startLogout,
    isLoggingIn,
    isLoggingOut,
    refreshSession,
  };
};
