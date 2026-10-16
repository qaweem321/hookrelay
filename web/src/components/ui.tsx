import type { ReactNode } from "react";
import type { DeliveryStatus } from "../../../shared/types";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
        {description && <p className="muted mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="muted flex items-center gap-2 py-10 text-sm">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="muted mt-2 text-sm">{children}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<DeliveryStatus, string> = {
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delivering: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  dead: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  paused: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  succeeded: "Delivered",
  pending: "Queued",
  delivering: "Sending",
  dead: "Failed",
  paused: "Paused",
};

export function StatusBadge({ status, count }: { status: DeliveryStatus; count?: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {count !== undefined && `${count} `}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" className="btn-secondary" disabled={loading} onClick={onClick}>
        {loading ? "Loading..." : "Load more"}
      </button>
    </div>
  );
}
