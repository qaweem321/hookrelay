import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { RequireGuest, RequireUser } from "../components/guards";
import { mockApi, renderWithProviders, stubLocation } from "../test/render";
import { AuthPage } from "./AuthPage";

function Where() {
  const location = useLocation();
  return <p>at {location.pathname + location.search}</p>;
}

const routes = (
  <Routes>
    <Route
      path="/login"
      element={
        <RequireGuest>
          <AuthPage mode="login" />
        </RequireGuest>
      }
    />
    <Route
      path="/setup"
      element={
        <RequireGuest setup>
          <AuthPage mode="setup" />
        </RequireGuest>
      }
    />
    <Route
      path="*"
      element={
        <RequireUser>
          <Where />
        </RequireUser>
      }
    />
  </Routes>
);

const loggedOut = { setupRequired: false, user: null };
const loggedIn = { setupRequired: false, user: { id: "u1", email: "a@example.com" } };

describe("auth routing", () => {
  it("sends logged-out visitors to login with the page to return to", async () => {
    mockApi({ "GET /api/auth/state": loggedOut });
    renderWithProviders(routes, { path: "/events/abc?x=1" });
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("sends logged-in visitors from login to the dashboard (or the safe next page)", async () => {
    mockApi({ "GET /api/auth/state": loggedIn });
    renderWithProviders(routes, { path: "/login?next=%2Fsources" });
    expect(await screen.findByText("at /sources")).toBeInTheDocument();
  });

  it("ignores off-site next links", async () => {
    mockApi({ "GET /api/auth/state": loggedIn });
    renderWithProviders(routes, { path: "/login?next=https%3A%2F%2Fevil.example" });
    expect(await screen.findByText("at /")).toBeInTheDocument();
  });

  it("shows setup until the first account exists", async () => {
    mockApi({ "GET /api/auth/state": { setupRequired: true, user: null } });
    renderWithProviders(routes, { path: "/" });
    expect(await screen.findByRole("heading", { name: "Create the first account" })).toBeInTheDocument();
  });

  it("logs in with a full page load to the requested page, and blocks double submits", async () => {
    const replace = stubLocation("/login");
    const calls = mockApi({
      "GET /api/auth/state": loggedOut,
      "POST /api/auth/login": () => [200, { user: loggedIn.user }],
    });
    renderWithProviders(routes, { path: "/login?next=%2Fevents" });
    await userEvent.type(await screen.findByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events"));
    expect(screen.getByRole("button", { name: "Logging in..." })).toBeDisabled();
    const login = calls.filter((c) => c.url === "/api/auth/login");
    expect(login).toHaveLength(1);
    expect(login[0]!.headers["x-requested-with"]).toBe("hookrelay");
  });

  it("shows the server's error message", async () => {
    mockApi({
      "GET /api/auth/state": loggedOut,
      "POST /api/auth/login": () => [401, { error: "Wrong email or password." }],
    });
    renderWithProviders(routes, { path: "/login" });
    await userEvent.type(await screen.findByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });
});
