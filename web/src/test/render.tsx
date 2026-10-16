import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export function renderWithProviders(ui: ReactNode, { path = "/" }: { path?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Answers fetch calls from a route table: { "GET /api/auth/state": body }.
export function mockApi(routes: Record<string, unknown | ((body: unknown) => [number, unknown])>) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body, headers: init.headers as Record<string, string> });
    const key = `${method} ${url.split("?")[0]}`;
    if (!(key in routes))
      return new Response(JSON.stringify({ error: `No mock for ${key}` }), { status: 500 });
    const handler = routes[key];
    const [status, payload] =
      typeof handler === "function" ? (handler as (b: unknown) => [number, unknown])(body) : [200, handler];
    return status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(payload), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

// jsdom's location can't be navigated; capture replace() calls instead.
export function stubLocation(pathname = "/") {
  const replace = vi.fn();
  vi.stubGlobal("location", { ...window.location, pathname, search: "", replace, reload: vi.fn() });
  return replace;
}
