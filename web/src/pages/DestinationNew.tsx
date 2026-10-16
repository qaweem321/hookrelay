import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import type { Destination } from "../../../shared/types";
import { DestinationForm } from "../components/DestinationForm";
import { PageHeader } from "../components/ui";
import { post } from "../lib/api";

export function DestinationNew() {
  const navigate = useNavigate();
  const client = useQueryClient();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/destinations" className="link">
          ← Destinations
        </Link>
      </p>
      <PageHeader title="New destination" />
      <DestinationForm
        submitLabel="Create destination"
        onSubmit={async (payload) => {
          const destination = await post<Destination>("/destinations", payload);
          await client.invalidateQueries({ queryKey: ["destinations"] });
          navigate(`/destinations/${destination.id}`);
        }}
      />
    </>
  );
}
