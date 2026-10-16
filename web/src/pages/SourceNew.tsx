import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import type { Source } from "../../../shared/types";
import { SourceForm } from "../components/SourceForm";
import { PageHeader } from "../components/ui";
import { post } from "../lib/api";

export function SourceNew() {
  const navigate = useNavigate();
  const client = useQueryClient();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/sources" className="link">
          ← Sources
        </Link>
      </p>
      <PageHeader title="New source" description="You'll get a URL to paste into the sending service." />
      <SourceForm
        submitLabel="Create source"
        onSubmit={async (payload) => {
          const source = await post<Source>("/sources", payload);
          await client.invalidateQueries({ queryKey: ["sources"] });
          navigate(`/sources/${source.id}`);
        }}
      />
    </>
  );
}
