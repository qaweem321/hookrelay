import { SsrfError } from "@qaweem321/no-ssrf/node";
import type { Context } from "../context";
import { parseRetryAfter } from "../lib/backoff";
import { signature } from "../lib/standard-webhooks";
import type { AttemptDoc, DeliveryDoc, EventDoc } from "../models";

export const USER_AGENT = "Hookrelay/1.0 (+https://github.com/qaweem321/hookrelay)";
const RESPONSE_PREVIEW_BYTES = 2_000;

export type AttemptOutcome = {
  attempt: AttemptDoc;
  ok: boolean;
  retryAfterMs: number | null;
};

export type Target = { url: string; secret: string; timeoutMs: number };

// Headers sent with every delivery. webhook-id stays the same on every retry and replay of a
// delivery, so receivers can use it to ignore copies they've already processed.
export function deliveryHeaders(
  delivery: Pick<DeliveryDoc, "_id" | "attemptCount" | "eventType" | "sourceId">,
  event: Pick<EventDoc, "_id" | "contentType" | "body">,
  secret: string,
  now: Date,
): Record<string, string> {
  const id = `msg_${String(delivery._id)}`;
  const timestamp = Math.floor(now.getTime() / 1000);
  const headers: Record<string, string> = {
    "content-type": event.contentType ?? "application/octet-stream",
    "user-agent": USER_AGENT,
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": signature(secret, id, timestamp, event.body),
    "x-hookrelay-event-id": String(event._id),
    "x-hookrelay-attempt": String(delivery.attemptCount + 1),
  };
  if (delivery.eventType) headers["x-hookrelay-event-type"] = delivery.eventType;
  return headers;
}

// One HTTP attempt. Never throws: network errors, timeouts and SSRF refusals become failed attempts.
export async function attemptDelivery(
  ctx: Context,
  delivery: Pick<DeliveryDoc, "_id" | "attemptCount" | "eventType" | "sourceId">,
  event: Pick<EventDoc, "_id" | "contentType" | "body">,
  target: Target,
): Promise<AttemptOutcome> {
  const started = ctx.now();
  const startedMs = performance.now();
  const headers = deliveryHeaders(delivery, event, target.secret, started);
  const duration = () => Math.round(performance.now() - startedMs);
  try {
    const response = await ctx.request(target.url, {
      method: "POST",
      headers,
      body: event.body,
      timeoutMs: target.timeoutMs,
      maxResponseBytes: RESPONSE_PREVIEW_BYTES,
      allowHttp: ctx.env.ALLOW_HTTP_DESTINATIONS,
      allowHosts: ctx.env.DESTINATION_ALLOW_HOSTS,
    });
    const ok = response.status >= 200 && response.status < 300;
    return {
      ok,
      retryAfterMs: ok ? null : parseRetryAfter(response.headers["retry-after"], started.getTime()),
      attempt: {
        at: started,
        durationMs: duration(),
        responseStatus: response.status,
        error: ok ? null : `HTTP ${response.status}`,
        responseBody: Buffer.from(response.body).toString("utf8").slice(0, RESPONSE_PREVIEW_BYTES) || null,
      },
    };
  } catch (error) {
    const message =
      error instanceof SsrfError
        ? `Refused: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return {
      ok: false,
      retryAfterMs: null,
      attempt: {
        at: started,
        durationMs: duration(),
        responseStatus: null,
        error: message,
        responseBody: null,
      },
    };
  }
}
