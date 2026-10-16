import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { SubmitButton } from "../components/buttons";
import { Logo } from "../components/Layout";
import { ErrorBox, Field } from "../components/ui";
import { post } from "../lib/api";
import { safeNext } from "../lib/next";

// Login and first-run setup share one form. After success a full page load (location.replace)
// starts the app fresh and keeps the login page out of the back-button history.
export function AuthPage({ mode }: { mode: "login" | "setup" }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = useMutation({
    mutationFn: () => post(mode === "login" ? "/auth/login" : "/auth/setup", { email, password }),
    onSuccess: () => window.location.replace(safeNext(params.get("next"))),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };
  const setup = mode === "setup";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">{setup ? "Create the first account" : "Log in"}</h1>
            <p className="muted mt-1 text-sm">
              {setup ? "This account can add teammates later in Settings." : "Welcome back."}
            </p>
          </div>
          <ErrorBox error={submit.error} />
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password" hint={setup ? "At least 10 characters." : undefined}>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
              minLength={setup ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <SubmitButton
            pending={submit.isPending || submit.isSuccess}
            pendingLabel={setup ? "Creating..." : "Logging in..."}
            className="btn-primary w-full"
          >
            {setup ? "Create account" : "Log in"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
