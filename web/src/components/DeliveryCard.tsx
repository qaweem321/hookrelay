import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Delivery } from "../../../shared/types";
import { post } from "../lib/api";
import { formatDateTime, formatNextTry } from "../lib/format";
import { ActionButton } from "./buttons";
import { ErrorBox, StatusBadge } from "./ui";

export function RetryButton({ delivery }: { delivery: Delivery }) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => post(`/deliveries/${delivery.id}/retry`),
    onSettled: () => client.invalidateQueries(),
  });
  if (delivery.status !== "dead" && delivery.status !== "succeeded") return null;
  return (
    <span className="flex flex-col items-end gap-1">
      <ActionButton pending={retry.isPending} pendingLabel="Queuing..." onClick={() => retry.mutate()}>
        {delivery.status === "dead" ? "Retry" : "Send again"}
      </ActionButton>
      {retry.error && <span className="text-xs text-red-600">{retry.error.message}</span>}
    </span>
  );
}

// One destination's delivery of an event, with every attempt.
export function DeliveryCard({ delivery }: { delivery: Delivery }) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {delivery.destinationName ? (
              <Link to={`/destinations/${delivery.destinationId}`} className="link">
                {delivery.destinationName}
              </Link>
            ) : (
              <span className="muted">Deleted destination</span>
            )}
            <StatusBadge status={delivery.status} />
          </div>
          <p className="muted mt-1 text-xs">
            {delivery.attemptCount} attempt{delivery.attemptCount === 1 ? "" : "s"}
            {delivery.status === "pending" &&
              delivery.nextAttemptAt &&
              ` · ${formatNextTry(delivery.nextAttemptAt)}`}
          </p>
        </div>
        <RetryButton delivery={delivery} />
      </div>
      {delivery.attempts.length > 0 && (
        <ol className="mt-4 space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
          {[...delivery.attempts].reverse().map((attempt) => (
            <li key={attempt.at} className="text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`font-mono font-medium ${
                    attempt.responseStatus && attempt.responseStatus < 300
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {attempt.responseStatus ?? "ERR"}
                </span>
                <span className="muted">{formatDateTime(attempt.at)}</span>
                <span className="muted">{attempt.durationMs} ms</span>
              </div>
              {attempt.error && attempt.responseStatus === null && (
                <p className="mt-1 text-red-700 dark:text-red-400">{attempt.error}</p>
              )}
              {attempt.responseBody && (
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-100 p-2 whitespace-pre-wrap dark:bg-slate-800">
                  {attempt.responseBody}
                </pre>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function MutationError({ error }: { error: unknown }) {
  return error ? (
    <div className="mb-4">
      <ErrorBox error={error} />
    </div>
  ) : null;
}
