import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { Destination } from "../../../shared/types";
import { useSources } from "../lib/queries";
import { SubmitButton } from "./buttons";
import { ErrorBox, Field } from "./ui";

export type DestinationPayload = Pick<
  Destination,
  "name" | "url" | "sourceIds" | "eventTypes" | "maxAttempts" | "timeoutMs"
>;

export function DestinationForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Destination;
  submitLabel: string;
  onSubmit: (payload: DestinationPayload) => Promise<unknown>;
}) {
  const sources = useSources();
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "https://");
  const [sourceIds, setSourceIds] = useState<string[]>(initial?.sourceIds ?? []);
  const [eventTypes, setEventTypes] = useState(initial?.eventTypes.join(", ") ?? "");
  const [maxAttempts, setMaxAttempts] = useState(initial?.maxAttempts ?? 8);
  const [timeoutSeconds, setTimeoutSeconds] = useState((initial?.timeoutMs ?? 10_000) / 1000);
  const save = useMutation({ mutationFn: onSubmit });

  const toggle = (id: string) =>
    setSourceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      name,
      url: url.trim(),
      sourceIds,
      eventTypes: eventTypes
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      maxAttempts,
      timeoutMs: Math.round(timeoutSeconds * 1000),
    });
  };

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <ErrorBox error={save.error} />
      <Field label="Name" htmlFor="name">
        <input
          id="name"
          className="input"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Billing service"
        />
      </Field>
      <Field
        label="URL"
        htmlFor="url"
        hint="Events are POSTed here with the original body. Private network addresses are refused."
      >
        <input
          id="url"
          className="input font-mono"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <fieldset>
        <legend className="label">Sources</legend>
        {sources.data?.length === 0 && (
          <p className="muted text-sm">No sources yet. You can link them later.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.data?.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={sourceIds.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Event types"
        htmlFor="event-types"
        hint="Comma-separated, e.g. invoice.paid, customer.* — leave empty for every event."
      >
        <input
          id="event-types"
          className="input font-mono"
          value={eventTypes}
          onChange={(e) => setEventTypes(e.target.value)}
          placeholder="All events"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Attempts before giving up"
          htmlFor="max-attempts"
          hint="8 attempts spread over about a day."
        >
          <input
            id="max-attempts"
            className="input"
            type="number"
            min={1}
            max={12}
            required
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Number(e.target.value))}
          />
        </Field>
        <Field label="Timeout (seconds)" htmlFor="timeout">
          <input
            id="timeout"
            className="input"
            type="number"
            min={1}
            max={30}
            required
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pending={save.isPending}>{submitLabel}</SubmitButton>
        {initial && save.isSuccess && (
          <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
