export const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json", ...init.headers },
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
