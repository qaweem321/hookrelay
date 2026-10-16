import { useMutation } from "@tanstack/react-query";
import { Link, NavLink, Outlet } from "react-router";
import { post } from "../lib/api";
import { useAuth } from "../lib/queries";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/events", label: "Events" },
  { to: "/deliveries", label: "Deliveries" },
  { to: "/sources", label: "Sources" },
  { to: "/destinations", label: "Destinations" },
  { to: "/settings", label: "Settings" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <img src="/favicon.svg" alt="" className="size-7" />
      Hookrelay
    </span>
  );
}

export function Layout() {
  const { data } = useAuth();
  // A full page load after logout, so the back button can't show pages from the old session.
  const logout = useMutation({
    mutationFn: () => post("/auth/logout"),
    onSettled: () => window.location.replace("/login"),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {/* The logo always leads to the dashboard. */}
          <Link to="/" aria-label="Hookrelay dashboard">
            <Logo />
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="muted hidden sm:inline">{data?.user?.email}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              {logout.isPending ? "Logging out..." : "Log out"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
