import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { DELIVERY_STATUSES, type Delivery, type Page } from "../../../shared/types";
import { RetryButton } from "../components/DeliveryCard";
import { Empty, ErrorBox, Loading, LoadMore, PageHeader, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import { formatDateTime, formatNextTry } from "../lib/format";
import { useDestinations } from "../lib/queries";

const STATUS_OPTIONS: Record<(typeof DELIVERY_STATUSES)[number], string> = {
  dead: "Failed",
  pending: "Queued",
  delivering: "Sending",
  succeeded: "Delivered",
  paused: "Paused",
};

export function Deliveries() {
  const [{ status, destinationId }, setFilter] = useFilters(["status", "destinationId"] as const);
  const destinations = useDestinations();
  const deliveries = useInfiniteQuery({
    queryKey: ["deliveries", status, destinationId],
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ status, destinationId, ...(pageParam && { before: pageParam }) });
      return api<Page<Delivery>>(`/deliveries?${query}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000,
  });
  const items = deliveries.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title="Deliveries" description="Every attempt to pass an event on to a destination." />
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          aria-label="Filter by status"
          className="input w-auto"
          value={status}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">Any status</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_OPTIONS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by destination"
          className="input w-auto"
          value={destinationId}
          onChange={(e) => setFilter("destinationId", e.target.value)}
        >
          <option value="">All destinations</option>
          {destinations.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      {deliveries.isPending && <Loading />}
      {deliveries.error && <ErrorBox error={deliveries.error} />}
      {deliveries.isSuccess && items.length === 0 && <Empty title="No deliveries match these filters" />}
      {items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Last attempt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const last = d.attempts.at(-1);
                return (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/events/${d.eventId}`} className="link">
                        {d.eventType ?? "Untyped event"}
                      </Link>
                      <p className="muted text-xs whitespace-nowrap">{formatDateTime(d.createdAt)}</p>
                    </td>
                    <td>{d.destinationName ?? "Deleted destination"}</td>
                    <td>
                      <StatusBadge status={d.status} />
                      <p className="muted mt-1 text-xs whitespace-nowrap">
                        {d.attemptCount} attempt{d.attemptCount === 1 ? "" : "s"}
                        {d.status === "pending" && d.nextAttemptAt && ` · ${formatNextTry(d.nextAttemptAt)}`}
                      </p>
                    </td>
                    <td className="text-sm">
                      {last ? (
                        <>
                          <span
                            className={
                              last.responseStatus && last.responseStatus < 300
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-700 dark:text-red-400"
                            }
                          >
                            {last.error ?? `HTTP ${last.responseStatus}`}
                          </span>
                          <p className="muted text-xs">{last.durationMs} ms</p>
                        </>
                      ) : (
                        <span className="muted">Not tried yet</span>
                      )}
                    </td>
                    <td className="text-right">
                      <RetryButton delivery={d} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore
        hasMore={deliveries.hasNextPage}
        loading={deliveries.isFetchingNextPage}
        onClick={() => deliveries.fetchNextPage()}
      />
    </>
  );
}
