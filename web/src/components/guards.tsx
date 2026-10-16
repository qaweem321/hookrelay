import type { ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { loginUrl, safeNext } from "../lib/next";
import { useAuth } from "../lib/queries";
import { ErrorBox, Loading } from "./ui";

// Logged-out visitors go to /login?next=<this page> and come back after logging in.
export function RequireUser({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isPending) return <Loading />;
  if (auth.error)
    return (
      <div className="p-8">
        <ErrorBox error={auth.error} />
      </div>
    );
  if (auth.data.setupRequired) return <Navigate to="/setup" replace />;
  if (!auth.data.user) return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  return children;
}

// Login and setup pages send people who are already logged in straight to the dashboard.
export function RequireGuest({ children, setup = false }: { children: ReactNode; setup?: boolean }) {
  const auth = useAuth();
  const [params] = useSearchParams();
  if (auth.isPending) return <Loading />;
  if (auth.error)
    return (
      <div className="p-8">
        <ErrorBox error={auth.error} />
      </div>
    );
  if (auth.data.user) return <Navigate to={safeNext(params.get("next"))} replace />;
  if (setup && !auth.data.setupRequired) return <Navigate to="/login" replace />;
  if (!setup && auth.data.setupRequired) return <Navigate to="/setup" replace />;
  return children;
}
