import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { User } from "../../../shared/types";
import { ConfirmButton, SubmitButton } from "../components/buttons";
import { PasswordInput } from "../components/PasswordInput";
import { ThemeSelect } from "../components/ThemeSelect";
import { ErrorBox, Field, Loading, PageHeader } from "../components/ui";
import { api, del, post } from "../lib/api";
import { formatDate } from "../lib/format";
import { useAuth } from "../lib/queries";

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => post("/auth/password", { current, next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <h2 className="font-medium">Your password</h2>
        <p className="muted text-sm">Changing it logs out your other sessions.</p>
      </div>
      <ErrorBox error={change.error} />
      {change.isSuccess && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Password changed.
        </p>
      )}
      <Field label="Current password" htmlFor="current">
        <PasswordInput
          id="current"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters.">
        <PasswordInput
          id="next"
          autoComplete="new-password"
          required
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <SubmitButton pending={change.isPending}>Change password</SubmitButton>
    </form>
  );
}

function Appearance() {
  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="font-medium">Appearance</h2>
        <p className="muted text-sm">Saved in this browser. System follows your device.</p>
      </div>
      <Field label="Theme" htmlFor="theme">
        <ThemeSelect />
      </Field>
    </section>
  );
}

function RemoveUser({ user }: { user: User }) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => del(`/users/${user.id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }),
  });
  return (
    <>
      <ConfirmButton
        label="Remove"
        title={`Remove ${user.email}?`}
        message="Are you sure? They're logged out right away and can't log in again."
        confirmLabel="Remove user"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      {remove.error && <p className="mt-1 text-xs text-red-600">{remove.error.message}</p>}
    </>
  );
}

function Team() {
  const auth = useAuth();
  const client = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const add = useMutation({
    mutationFn: () => post<User>("/users", { email, password }),
    onSuccess: () => {
      setEmail("");
      setPassword("");
      return client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <section className="card p-6">
      <h2 className="font-medium">Team</h2>
      <p className="muted text-sm">
        Everyone here has full access. Share the temporary password privately and ask them to change it.
      </p>
      {users.isPending && <Loading />}
      {users.error && <ErrorBox error={users.error} />}
      <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {users.data?.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{u.email}</p>
              <p className="muted text-xs">Added {formatDate(u.createdAt)}</p>
            </div>
            {u.id === auth.data?.user?.id ? (
              <span className="muted text-xs">You</span>
            ) : (
              <RemoveUser user={u} />
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <h3 className="text-sm font-medium">Add a teammate</h3>
        <ErrorBox error={add.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            aria-label="Email"
            className="input"
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordInput
            aria-label="Temporary password"
            autoComplete="new-password"
            placeholder="Temporary password (10+ characters)"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <SubmitButton pending={add.isPending}>Add teammate</SubmitButton>
      </form>
    </section>
  );
}

export function Settings() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Team />
        <div className="space-y-6">
          <ChangePassword />
          <Appearance />
        </div>
      </div>
    </>
  );
}
