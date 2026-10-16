import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { DELIVERY_STATUSES, type EventSummary, type Page } from "../../../shared/types";
import { Empty, ErrorBox, Loading, LoadMore, PageHeader, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { formatBytes, formatDateTime } from "../lib/format";
import { useSources } from "../lib/queries";

export function Events() {
  const [{ sourceId, eventType }, setFilter] = useFilters(["sourceId", "eventType"] as const);
  const sources = useSources();
  const types = useQuery({ queryKey: ["event-types"], queryFn: () => api<string[]>("/events/types") });
  const events = useInfiniteQuery({
    queryKey: ["events", sourceId, eventType],
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ sourceId, eventType, ...(pageParam && { before: pageParam }) });
      return api<Page<EventSummary>>(`/events?${query}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000,
  });
  const items = events.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Events"
        description="Every webhook received, newest first. Refreshes every 10 seconds."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          aria-label="Filter by source"
          className="input w-auto"
          value={sourceId}
          onChange={(e) => setFilter("sourceId", e.target.value)}
        >
          <option value="">All sources</option>
          {sources.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by event type"
          className="input w-auto"
          value={eventType}
          onChange={(e) => setFilter("eventType", e.target.value)}
        >
          <option value="">All event types</option>
          {types.data?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {events.isPending && <Loading />}
      {events.error && <ErrorBox error={events.error} />}
      {events.isSuccess && items.length === 0 && (
        <Empty title={sourceId || eventType ? "No events match these filters" : "No events yet"}>
          {!sourceId &&
            !eventType &&
            "Send a webhook to one of your sources, or use “Send test event” on a source."}
        </Empty>
      )}
      {items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Source</th>
                <th>Deliveries</th>
                <th>Size</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/events/${e.id}`} className="link">
                      {e.eventType ?? "Untyped event"}
                    </Link>
                    {e.dedupeKey && (
                      <p className="muted mt-0.5 max-w-56 truncate font-mono text-xs">{e.dedupeKey}</p>
                    )}
                  </td>
                  <td>{e.sourceName ?? "–"}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {DELIVERY_STATUSES.filter((s) => e.deliveries[s] > 0).map((s) => (
                        <StatusBadge key={s} status={s} count={e.deliveries[s]} />
                      ))}
                      {DELIVERY_STATUSES.every((s) => e.deliveries[s] === 0) && (
                        <span className="muted text-xs">No destinations</span>
                      )}
                    </span>
                  </td>
                  <td className="muted whitespace-nowrap">{formatBytes(e.size)}</td>
                  <td className="muted whitespace-nowrap">{formatDateTime(e.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore
        hasMore={events.hasNextPage}
        loading={events.isFetchingNextPage}
        onClick={() => events.fetchNextPage()}
      />
    </>
  );
}
