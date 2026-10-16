import { z } from "zod";
import { PROVIDERS } from "./types";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."))
  .pipe(z.string().max(254));
export const password = z.string().min(10, "Use at least 10 characters.").max(200);

export const credentials = z.object({ email, password: z.string().min(1).max(200) });
export const newAccount = z.object({ email, password });
export const passwordChange = z.object({ current: z.string().min(1).max(200), next: password });

const name = z.string().trim().min(1, "Give it a name.").max(80);

export const sourceInput = z.object({
  name,
  provider: z.enum(PROVIDERS),
  // Omitted: keep the current secret. Empty string: remove it.
  secret: z.string().max(500).optional(),
  hmac: z
    .object({
      header: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{1,64}$/, "Use a valid header name.")
        .default("x-signature"),
      encoding: z.enum(["hex", "base64"]).default("hex"),
      prefix: z.string().max(32).default(""),
    })
    .default({ header: "x-signature", encoding: "hex", prefix: "" }),
});

export const eventTypePattern = z
  .string()
  .trim()
  .regex(/^(\*|[A-Za-z0-9_:.\-/]+(\.\*)?)$/, "Use names like invoice.paid, invoice.* or *.")
  .max(200);

export const destinationInput = z.object({
  name,
  url: z.url({ protocol: /^https?$/, error: "Enter an http(s) URL." }).max(2000),
  sourceIds: z
    .array(z.string().regex(/^[0-9a-f]{24}$/i))
    .max(100)
    .default([]),
  eventTypes: z.array(eventTypePattern).max(50).default([]),
  maxAttempts: z.coerce.number().int().min(1).max(12).default(8),
  timeoutMs: z.coerce.number().int().min(1000).max(30_000).default(10_000),
});
