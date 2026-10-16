import { loginUrl } from "./next";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Every request carries the session cookie and the CSRF header the API requires for writes.
// A 401 outside the auth endpoints means the session expired: go to login and come back here.
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: {
      "x-requested-with": "hookrelay",
      ...(init.body !== undefined && { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 401 && !path.startsWith("/auth/")) {
    window.location.replace(loginUrl(window.location.pathname + window.location.search));
    throw new ApiError(401, "Your session expired. Please log in again.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export const post = <T = void>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body ?? {} });
export const patch = <T = void>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const del = (path: string) => api<void>(path, { method: "DELETE" });
