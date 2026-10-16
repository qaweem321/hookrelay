import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import type { EventDetail as EventDetailDto } from "../../../shared/types";
import { ActionButton } from "../components/buttons";
import { DeliveryCard, MutationError } from "../components/DeliveryCard";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { api, ApiError, post } from "../lib/api";
import { formatBytes, formatDateTime } from "../lib/format";

function prettyBody(event: EventDetailDto) {
  if (event.bodyEncoding === "base64") return { text: event.body, note: "Binary body, shown as base64" };
  try {
    return { text: JSON.stringify(JSON.parse(event.body), null, 2), note: null };
  } catch {
    return { text: event.body, note: null };
  }
}

export function EventDetail() {
  const { id } = useParams();
  const client = useQueryClient();
  const event = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventDetailDto>(`/events/${id}`),
    refetchInterval: (query) =>
      query.state.data?.deliveryList.some((d) => d.status === "pending" || d.status === "delivering")
        ? 3_000
        : false,
  });
  const replay = useMutation({
    mutationFn: () => post<{ requeued: number; created: number }>(`/events/${id}/replay`),
    onSettled: () => client.invalidateQueries(),
  });

  if (event.isPending) return <Loading />;
  if (event.error instanceof ApiError && event.error.status === 404) {
    return (
      <Empty title="Event not found">
        It may have been deleted or passed the retention period.{" "}
        <Link to="/events" className="link">
          Back to events
        </Link>
      </Empty>
    );
  }
  if (event.error) return <ErrorBox error={event.error} />;
  const e = event.data;
  const body = prettyBody(e);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/events" className="link">
          ← Events
        </Link>
      </p>
      <PageHeader
        title={e.eventType ?? "Untyped event"}
        description={`${e.sourceName ?? "Deleted source"} · received ${formatDateTime(e.receivedAt)} · ${formatBytes(e.size)}`}
        actions={
          <ActionButton
            pending={replay.isPending}
            pendingLabel="Replaying..."
            onClick={() => replay.mutate()}
          >
            Replay to all destinations
          </ActionButton>
        }
      />
      <MutationError error={replay.error} />
      {replay.data && (
        <p role="status" className="mb-4 text-sm text-emerald-700 dark:text-emerald-400">
          Replay queued: {replay.data.requeued} re-sent, {replay.data.created} new destination
          {replay.data.created === 1 ? "" : "s"}.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <h2 className="font-medium">Deliveries</h2>
          {e.deliveryList.length === 0 && <Empty title="No destination subscribed to this event" />}
          {e.deliveryList.map((d) => (
            <DeliveryCard key={d.id} delivery={d} />
          ))}
        </section>
        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="mb-2 font-medium">Body</h2>
            {body.note && <p className="muted mb-1 text-xs">{body.note}</p>}
            <pre className="card max-h-[28rem] overflow-auto p-4 whitespace-pre-wrap break-all">
              {body.text || "(empty)"}
            </pre>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Headers</h2>
            <div className="card overflow-x-auto">
              <table className="table">
                <tbody>
                  {Object.entries(e.headers)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, value]) => (
                      <tr key={name}>
                        <td className="font-mono text-xs whitespace-nowrap">{name}</td>
                        <td className="font-mono text-xs break-all">{value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
