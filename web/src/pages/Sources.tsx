import { Link } from "react-router";
import { PROVIDER_LABELS } from "../../../shared/types";
import { CopyButton } from "../components/buttons";
import { Empty, ErrorBox, Loading, PageHeader } from "../components/ui";
import { useSources } from "../lib/queries";

export function Sources() {
  const sources = useSources();
  return (
    <>
      <PageHeader
        title="Sources"
        description="Where webhooks come in. Each source has its own URL and checks the sender's signature."
        actions={
          <Link to="/sources/new" className="btn-primary">
            New source
          </Link>
        }
      />
      {sources.isPending && <Loading />}
      {sources.error && <ErrorBox error={sources.error} />}
      {sources.data?.length === 0 && (
        <Empty title="No sources yet">
          Create one, then paste its URL into the service that sends webhooks.
        </Empty>
      )}
      <div className="grid gap-4">
        {sources.data?.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/sources/${s.id}`} className="link text-base">
                {s.name}
              </Link>
              <span className="muted text-sm">{PROVIDER_LABELS[s.provider]}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <code className="input truncate bg-slate-50 dark:bg-slate-950">{s.ingestUrl}</code>
              <CopyButton value={s.ingestUrl} />
            </div>
            {s.rejectedCount > 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                {s.rejectedCount} request{s.rejectedCount === 1 ? "" : "s"} rejected (bad or missing
                signature)
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
