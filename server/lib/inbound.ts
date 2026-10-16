import { createHmac } from "node:crypto";
import type { HmacConfig, Provider } from "../../shared/types";
import { safeEqual } from "./crypto";
import { signature as standardSignature } from "./standard-webhooks";

export type InboundConfig = { provider: Provider; secret: string | null; hmac: HmacConfig };
export type Headers = Record<string, string>;
export type Verdict = { ok: true } | { ok: false; reason: string };

// Signed timestamps older or newer than this are rejected, so a captured request can't be replayed later.
export const TOLERANCE_SECONDS = 300;

const hmacSha256 = (secret: string | Buffer, ...parts: (string | Buffer)[]) => {
  const mac = createHmac("sha256", secret);
  for (const part of parts) mac.update(part);
  return mac;
};

function checkTimestamp(value: string | undefined, now: number): Verdict {
  const seconds = Number(value);
  if (!value || !Number.isInteger(seconds)) return { ok: false, reason: "missing or malformed timestamp" };
  if (Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS)
    return { ok: false, reason: "timestamp outside the 5-minute tolerance" };
  return { ok: true };
}

export function verifyInbound(
  config: InboundConfig,
  headers: Headers,
  body: Buffer,
  now = Date.now(),
): Verdict {
  if (config.provider === "none") return { ok: true };
  if (!config.secret) return { ok: false, reason: "no signing secret configured for this source" };
  const secret = config.secret;

  switch (config.provider) {
    case "github": {
      const header = headers["x-hub-signature-256"];
      if (!header) return { ok: false, reason: "missing X-Hub-Signature-256 header" };
      const expected = `sha256=${hmacSha256(secret, body).digest("hex")}`;
      return safeEqual(header, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
    }
    case "stripe": {
      const header = headers["stripe-signature"];
      if (!header) return { ok: false, reason: "missing Stripe-Signature header" };
      const pairs = header.split(",").map((part) => part.split("=") as [string, string?]);
      const timestamp = pairs.find(([key]) => key === "t")?.[1];
      const time = checkTimestamp(timestamp, now);
      if (!time.ok) return time;
      const expected = hmacSha256(secret, `${timestamp}.`, body).digest("hex");
      const match = pairs.some(
        ([key, value]) => key === "v1" && value !== undefined && safeEqual(value, expected),
      );
      return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
    }
    case "standard": {
      const id = headers["webhook-id"];
      const timestamp = headers["webhook-timestamp"];
      const header = headers["webhook-signature"];
      if (!id || !header) return { ok: false, reason: "missing webhook-id or webhook-signature header" };
      const time = checkTimestamp(timestamp, now);
      if (!time.ok) return time;
      const expected = standardSignature(secret, id, Number(timestamp), body);
      const match = header.split(" ").some((candidate) => safeEqual(candidate, expected));
      return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
    }
    case "hmac": {
      const { header: name, encoding, prefix } = config.hmac;
      const header = headers[name.toLowerCase()];
      if (!header) return { ok: false, reason: `missing ${name} header` };
      const expected = `${prefix}${hmacSha256(secret, body).digest(encoding)}`;
      return safeEqual(header, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
    }
  }
}

function parseJson(body: Buffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value.slice(0, 200) : null);

export type EventMeta = { dedupeKey: string | null; eventType: string | null };

// The provider's own event ID (used to drop retries of the same webhook) and its event type.
export function extractMeta(provider: Provider, headers: Headers, body: Buffer): EventMeta {
  const json = parseJson(body);
  switch (provider) {
    case "github":
      return { dedupeKey: text(headers["x-github-delivery"]), eventType: text(headers["x-github-event"]) };
    case "stripe":
      return { dedupeKey: text(json?.id), eventType: text(json?.type) };
    case "standard":
      return { dedupeKey: text(headers["webhook-id"]), eventType: text(json?.type) };
    default:
      return {
        dedupeKey: text(headers["idempotency-key"] ?? headers["webhook-id"]),
        eventType: text(json?.type ?? json?.event ?? headers["x-event-type"]),
      };
  }
}
