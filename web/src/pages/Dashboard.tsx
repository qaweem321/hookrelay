import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Delivery, Page, Stats } from "../../../shared/types";
import { HourlyChart } from "../components/HourlyChart";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, formatPercent } from "../lib/format";
import { useSources } from "../lib/queries";

export function Dashboard() {
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<Stats>("/stats"),
    refetchInterval: 10_000,
  });
  const failures = useQuery({
    queryKey: ["deliveries", "dead", "recent"],
    queryFn: () => api<Page<Delivery>>("/deliveries?status=dead"),
    refetchInterval: 10_000,
  });
  const sources = useSources();

  if (stats.isPending || sources.isPending) return <Loading />;
  if (stats.error || sources.error) return <ErrorBox error={stats.error ?? sources.error} />;
  const s = stats.data;

  if (sources.data.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty title="No sources yet">
          <p>A source gives you a URL to paste into GitHub, Stripe or any service that sends webhooks.</p>
          <Link to="/sources/new" className="btn-primary mt-4">
            Add your first source
          </Link>
        </Empty>
      </>
    );
  }

  const cards = [
    { label: "Events received", value: s.events24h.toLocaleString("en-US"), note: "last 24 hours" },
    {
      label: "Delivery success",
      value: formatPercent(s.successRate),
      note: `${s.succeeded24h} delivered, ${s.dead24h} failed`,
    },
    { label: "In the queue", value: s.pending.toLocaleString("en-US"), note: "waiting or retrying" },
    {
      label: "Failed for good",
      value: s.dead24h.toLocaleString("en-US"),
      note: "retries used up",
      danger: s.dead24h > 0,
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="The last 24 hours. Refreshes every 10 seconds." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <p className="muted text-sm">{card.label}</p>
            <p
              className={`mt-1 text-3xl font-semibold tabular-nums ${card.danger ? "text-red-600 dark:text-red-400" : ""}`}
            >
              {card.value}
            </p>
            <p className="muted mt-1 text-xs">{card.note}</p>
          </div>
        ))}
      </div>
      <section className="card mt-6 p-4">
        <h2 className="mb-3 font-medium">Per hour</h2>
        <HourlyChart hourly={s.hourly} />
      </section>
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent failures</h2>
          <Link to="/deliveries?status=dead" className="link text-sm">
            See all
          </Link>
        </div>
        {failures.error && <ErrorBox error={failures.error} />}
        {failures.data && failures.data.items.length === 0 && <Empty title="No failed deliveries. Nice." />}
        {failures.data && failures.data.items.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Event</th>
                  <th>Last error</th>
                  <th>Gave up</th>
                </tr>
              </thead>
              <tbody>
                {failures.data.items.slice(0, 8).map((d) => (
                  <tr key={d.id}>
                    <td>{d.destinationName ?? "Deleted destination"}</td>
                    <td>
                      <Link to={`/events/${d.eventId}`} className="link">
                        {d.eventType ?? "Untyped event"}
                      </Link>
                    </td>
                    <td className="text-red-700 dark:text-red-400">{d.attempts.at(-1)?.error ?? "–"}</td>
                    <td className="muted whitespace-nowrap">
                      {d.completedAt ? formatDateTime(d.completedAt) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
