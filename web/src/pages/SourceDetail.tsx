import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { PROVIDER_LABELS, type Provider, type Source } from "../../../shared/types";
import { ActionButton, CopyButton } from "../components/buttons";
import { DangerZone } from "../components/DangerZone";
import { MutationError } from "../components/DeliveryCard";
import { SourceForm } from "../components/SourceForm";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { api, ApiError, del, patch, post } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";

const SETUP_STEPS: Record<Provider, string> = {
  github:
    "In GitHub: Settings → Webhooks → Add webhook. Paste this URL as the Payload URL, choose application/json, and use the same secret.",
  stripe:
    "In Stripe: Developers → Webhooks → Add endpoint. Paste this URL, then copy the endpoint's signing secret into this source.",
  standard:
    "In the sending service, add an endpoint with this URL and copy its signing secret (whsec_...) into this source.",
  hmac: "The sender signs the raw body with HMAC-SHA256 and the shared secret, and sends the result in the header below.",
  none: "Send POST requests to this URL. No signature is checked.",
};

export function SourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const source = useQuery({ queryKey: ["source", id], queryFn: () => api<Source>(`/sources/${id}`) });
  const test = useMutation({
    mutationFn: () => post<{ eventId: string; deliveries: number }>(`/sources/${id}/test`),
    onSuccess: () => client.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: () => del(`/sources/${id}`),
    onSuccess: async () => {
      await client.invalidateQueries();
      navigate("/sources", { replace: true });
    },
  });

  if (source.isPending) return <Loading />;
  if (source.error instanceof ApiError && source.error.status === 404)
    return <Empty title="Source not found" />;
  if (source.error) return <ErrorBox error={source.error} />;
  const s = source.data;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/sources" className="link">
          ← Sources
        </Link>
      </p>
      <PageHeader
        title={s.name}
        description={`${PROVIDER_LABELS[s.provider]} · created ${formatDate(s.createdAt)}`}
        actions={
          <>
            <Link to={`/events?sourceId=${s.id}`} className="btn-secondary">
              View events
            </Link>
            <ActionButton pending={test.isPending} pendingLabel="Sending..." onClick={() => test.mutate()}>
              Send test event
            </ActionButton>
          </>
        }
      />
      <MutationError error={test.error} />
      {test.data && (
        <p role="status" className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
          Test event received and queued for {test.data.deliveries} destination
          {test.data.deliveries === 1 ? "" : "s"}.{" "}
          <Link to={`/events/${test.data.eventId}`} className="link">
            Open it
          </Link>
        </p>
      )}
      <section className="card mb-6 p-6">
        <h2 className="font-medium">Webhook URL</h2>
        <p className="muted mt-1 text-sm">{SETUP_STEPS[s.provider]}</p>
        <div className="mt-3 flex gap-2">
          <code className="input truncate bg-slate-50 dark:bg-slate-950">{s.ingestUrl}</code>
          <CopyButton value={s.ingestUrl} />
        </div>
        {s.rejectedCount > 0 && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
            {s.rejectedCount} rejected request{s.rejectedCount === 1 ? "" : "s"}. Last one{" "}
            {s.lastRejectedAt && formatDateTime(s.lastRejectedAt)}: {s.lastRejectedReason}.
          </p>
        )}
      </section>
      <h2 className="mb-3 font-medium">Settings</h2>
      <SourceForm
        key={s.id}
        initial={s}
        submitLabel="Save changes"
        onSubmit={async (payload) => {
          const updated = await patch<Source>(`/sources/${id}`, payload);
          client.setQueryData(["source", id], updated);
          await client.invalidateQueries({ queryKey: ["sources"] });
        }}
      />
      <DangerZone
        title="Delete source"
        description="Its URL stops working, and its events and deliveries are deleted."
        confirmTitle={`Delete “${s.name}”?`}
        confirmMessage="Are you sure? Its URL stops accepting webhooks, and all of its events and deliveries are deleted. This can't be undone."
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
