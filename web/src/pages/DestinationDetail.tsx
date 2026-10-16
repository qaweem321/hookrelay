import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Destination } from "../../../shared/types";
import { ActionButton, ConfirmButton, CopyButton } from "../components/buttons";
import { DangerZone } from "../components/DangerZone";
import { MutationError } from "../components/DeliveryCard";
import { DestinationForm } from "../components/DestinationForm";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { api, ApiError, del, patch, post } from "../lib/api";
import { formatDate } from "../lib/format";

function SigningSecret({ id }: { id: string }) {
  const client = useQueryClient();
  const [shown, setShown] = useState(false);
  const secret = useQuery({
    queryKey: ["destination-secret", id],
    queryFn: () => api<{ secret: string }>(`/destinations/${id}/secret`),
    enabled: shown,
  });
  const rotate = useMutation({
    mutationFn: () => post<{ secret: string }>(`/destinations/${id}/rotate-secret`),
    onSuccess: (data) => {
      client.setQueryData(["destination-secret", id], data);
      setShown(true);
    },
  });

  return (
    <section className="card mb-6 p-6">
      <h2 className="font-medium">Signing secret</h2>
      <p className="muted mt-1 text-sm">
        Every delivery is signed per the{" "}
        <a className="link" href="https://www.standardwebhooks.com" target="_blank" rel="noreferrer">
          Standard Webhooks
        </a>{" "}
        spec (<code>webhook-id</code>, <code>webhook-timestamp</code>, <code>webhook-signature</code>{" "}
        headers). Verify it in your service with this secret.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <code className="input min-w-0 flex-1 truncate bg-slate-50 dark:bg-slate-950">
          {shown && secret.data ? secret.data.secret : "whsec_••••••••••••••••••••••••"}
        </code>
        {shown && secret.data ? (
          <CopyButton value={secret.data.secret} />
        ) : (
          <button
            type="button"
            className="btn-secondary"
            disabled={secret.isFetching}
            onClick={() => setShown(true)}
          >
            {secret.isFetching ? "Loading..." : "Reveal"}
          </button>
        )}
        <ConfirmButton
          label="Rotate"
          title="Rotate the signing secret?"
          message="Are you sure? Deliveries are signed with the new secret right away, so your service will reject them until you update it there too."
          confirmLabel="Rotate secret"
          pending={rotate.isPending}
          onConfirm={() => rotate.mutate()}
        />
      </div>
      {(secret.error || rotate.error) && (
        <div className="mt-3">
          <ErrorBox error={secret.error ?? rotate.error} />
        </div>
      )}
    </section>
  );
}

export function DestinationDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const destination = useQuery({
    queryKey: ["destination", id],
    queryFn: () => api<Destination>(`/destinations/${id}`),
  });
  const refresh = () => client.invalidateQueries();
  const togglePause = useMutation({
    mutationFn: (paused: boolean) => post(`/destinations/${id}/${paused ? "resume" : "pause"}`),
    onSettled: refresh,
  });
  const retryDead = useMutation({
    mutationFn: () => post<{ retried: number }>(`/destinations/${id}/retry-dead`),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => del(`/destinations/${id}`),
    onSuccess: async () => {
      await client.invalidateQueries();
      navigate("/destinations", { replace: true });
    },
  });

  if (destination.isPending) return <Loading />;
  if (destination.error instanceof ApiError && destination.error.status === 404)
    return <Empty title="Destination not found" />;
  if (destination.error) return <ErrorBox error={destination.error} />;
  const d = destination.data;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/destinations" className="link">
          ← Destinations
        </Link>
      </p>
      <PageHeader
        title={d.name}
        description={
          <>
            {d.paused ? "Paused: deliveries wait until you resume." : "Active"} · created{" "}
            {formatDate(d.createdAt)}
          </>
        }
        actions={
          <>
            <Link to={`/deliveries?destinationId=${d.id}`} className="btn-secondary">
              View deliveries
            </Link>
            <ActionButton
              pending={retryDead.isPending}
              pendingLabel="Queuing..."
              onClick={() => retryDead.mutate()}
            >
              Retry all failed
            </ActionButton>
            <ActionButton pending={togglePause.isPending} onClick={() => togglePause.mutate(d.paused)}>
              {d.paused ? "Resume" : "Pause"}
            </ActionButton>
          </>
        }
      />
      <MutationError error={togglePause.error ?? retryDead.error} />
      {retryDead.data && (
        <p role="status" className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
          {retryDead.data.retried === 0
            ? "No failed deliveries to retry."
            : `${retryDead.data.retried} failed deliver${retryDead.data.retried === 1 ? "y" : "ies"} queued again.`}
        </p>
      )}
      <SigningSecret id={id} />
      <h2 className="mb-3 font-medium">Settings</h2>
      <DestinationForm
        key={d.id}
        initial={d}
        submitLabel="Save changes"
        onSubmit={async (payload) => {
          const updated = await patch<Destination>(`/destinations/${id}`, payload);
          client.setQueryData(["destination", id], updated);
          await client.invalidateQueries({ queryKey: ["destinations"] });
        }}
      />
      <DangerZone
        title="Delete destination"
        description="Stops all deliveries to it and deletes its delivery history."
        confirmTitle={`Delete “${d.name}”?`}
        confirmMessage="Are you sure? Queued deliveries are dropped and its delivery history is deleted. This can't be undone."
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
