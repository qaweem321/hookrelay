import { Link } from "react-router";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { useDestinations, useSources } from "../lib/queries";

export function Destinations() {
  const destinations = useDestinations();
  const sources = useSources();
  const sourceName = new Map(sources.data?.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Destinations"
        description="Your services that receive events, signed so they can check the events came from Hookrelay."
        actions={
          <Link to="/destinations/new" className="btn-primary">
            New destination
          </Link>
        }
      />
      {destinations.isPending && <Loading />}
      {destinations.error && <ErrorBox error={destinations.error} />}
      {destinations.data?.length === 0 && (
        <Empty title="No destinations yet">Add the URL of a service that should receive events.</Empty>
      )}
      <div className="grid gap-4">
        {destinations.data?.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/destinations/${d.id}`} className="link text-base">
                {d.name}
              </Link>
              {d.paused && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                  Paused
                </span>
              )}
            </div>
            <p className="muted mt-1 truncate font-mono text-xs">{d.url}</p>
            <p className="muted mt-2 text-sm">
              From{" "}
              {d.sourceIds.length === 0
                ? "no sources yet"
                : d.sourceIds.map((id) => sourceName.get(id) ?? "?").join(", ")}
              {" · "}
              {d.eventTypes.length === 0 ? "all events" : d.eventTypes.join(", ")}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
