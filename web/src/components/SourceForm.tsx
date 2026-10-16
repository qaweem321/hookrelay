import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  PROVIDER_LABELS,
  PROVIDERS,
  type HmacConfig,
  type Provider,
  type Source,
} from "../../../shared/types";
import { SubmitButton } from "./buttons";
import { ErrorBox, Field } from "./ui";

export type SourcePayload = { name: string; provider: Provider; secret?: string; hmac: HmacConfig };

const SECRET_HINTS: Record<Provider, string> = {
  github: "The secret you type in the GitHub webhook settings.",
  stripe: "The endpoint's signing secret from the Stripe dashboard (starts with whsec_).",
  standard: "The endpoint's signing secret (starts with whsec_).",
  hmac: "The shared secret the sender signs the body with.",
  none: "",
};

export function SourceForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Source;
  submitLabel: string;
  onSubmit: (payload: SourcePayload) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? "github");
  const [secret, setSecret] = useState("");
  const [hmac, setHmac] = useState<HmacConfig>(
    initial?.hmac ?? { header: "x-signature", encoding: "hex", prefix: "" },
  );
  const save = useMutation({ mutationFn: onSubmit });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // When editing, an empty field keeps the stored secret.
    const keepSecret = initial?.hasSecret && secret === "";
    save.mutate({
      name,
      provider,
      hmac,
      ...(provider === "none" ? { secret: "" } : keepSecret ? {} : { secret }),
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
          placeholder="GitHub: acme/api"
        />
      </Field>
      <Field
        label="Sender"
        htmlFor="provider"
        hint="Decides how the signature is checked and where the event ID and type are read from."
      >
        <select
          id="provider"
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </Field>
      {provider === "none" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Anyone who knows this source's URL can send events to it. Use a signature check when the sender
          supports one.
        </p>
      ) : (
        <Field
          label="Signing secret"
          htmlFor="secret"
          hint={
            initial?.hasSecret
              ? `${SECRET_HINTS[provider]} Leave empty to keep the current secret.`
              : SECRET_HINTS[provider]
          }
        >
          <input
            id="secret"
            className="input font-mono"
            type="password"
            autoComplete="off"
            required={!initial?.hasSecret}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={initial?.hasSecret ? "•••••••• (unchanged)" : ""}
          />
        </Field>
      )}
      {provider === "hmac" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Header" htmlFor="hmac-header">
            <input
              id="hmac-header"
              className="input font-mono"
              required
              value={hmac.header}
              onChange={(e) => setHmac({ ...hmac, header: e.target.value })}
            />
          </Field>
          <Field label="Encoding" htmlFor="hmac-encoding">
            <select
              id="hmac-encoding"
              className="input"
              value={hmac.encoding}
              onChange={(e) => setHmac({ ...hmac, encoding: e.target.value as HmacConfig["encoding"] })}
            >
              <option value="hex">hex</option>
              <option value="base64">base64</option>
            </select>
          </Field>
          <Field label="Prefix" htmlFor="hmac-prefix" hint="e.g. sha256=">
            <input
              id="hmac-prefix"
              className="input font-mono"
              value={hmac.prefix}
              onChange={(e) => setHmac({ ...hmac, prefix: e.target.value })}
            />
          </Field>
        </div>
      )}
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
