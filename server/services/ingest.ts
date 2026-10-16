import { mongo, type Types } from "mongoose";
import { expiresAt, type Context } from "../context";
import { decryptSecret } from "../lib/crypto";
import { matchesEventType } from "../lib/filter";
import { extractMeta, verifyInbound, type Headers } from "../lib/inbound";
import { Delivery, Destination, Event, Source, type EventDoc, type SourceDoc } from "../models";

// Request headers that may carry credentials are never stored or shown in the dashboard.
const REDACTED = new Set(["authorization", "cookie", "proxy-authorization", "x-api-key"]);

export function storedHeaders(headers: Headers): Headers {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, REDACTED.has(name) ? "[redacted]" : value]),
  );
}

export type IngestResult =
  | { status: 202; eventId: string; deliveries: number }
  | { status: 200; eventId: string; duplicate: true }
  | { status: 401; error: string };

const isDuplicateKey = (error: unknown) => error instanceof mongo.MongoServerError && error.code === 11000;

export async function receive(
  ctx: Context,
  source: SourceDoc,
  headers: Headers,
  body: Buffer,
  options: { skipVerification?: boolean } = {},
): Promise<IngestResult> {
  const now = ctx.now();
  if (!options.skipVerification) {
    const secret = source.secretEnc ? decryptSecret(source.secretEnc, ctx.key) : null;
    const verdict = verifyInbound(
      { provider: source.provider, secret, hmac: source.hmac },
      headers,
      body,
      now.getTime(),
    );
    if (!verdict.ok) {
      await Source.updateOne(
        { _id: source._id },
        { $inc: { rejectedCount: 1 }, $set: { lastRejectedAt: now, lastRejectedReason: verdict.reason } },
      );
      return { status: 401, error: `Signature check failed: ${verdict.reason}` };
    }
  }

  const meta = extractMeta(source.provider, headers, body);
  try {
    const event = await Event.create({
      sourceId: source._id,
      ...meta,
      contentType: headers["content-type"] ?? null,
      headers: storedHeaders(headers),
      body,
      size: body.length,
      receivedAt: now,
      expiresAt: expiresAt(ctx, now),
    });
    const deliveries = await fanout(ctx, event);
    return { status: 202, eventId: String(event._id), deliveries };
  } catch (error) {
    // The provider retried a webhook we already have: acknowledge it without delivering twice.
    if (!isDuplicateKey(error) || !meta.dedupeKey) throw error;
    const existing = await Event.findOne(
      { sourceId: source._id, dedupeKey: meta.dedupeKey },
      { _id: 1 },
    ).lean();
    if (!existing) throw error;
    return { status: 200, eventId: String(existing._id), duplicate: true };
  }
}

// Creates one delivery per matching destination. Safe to run again for the same event: the
// unique (eventId, destinationId) index turns repeats into no-ops.
export async function fanout(
  ctx: Context,
  event: Pick<EventDoc, "_id" | "sourceId" | "eventType" | "receivedAt">,
  onlyDestinationIds?: Types.ObjectId[],
): Promise<number> {
  const filter = onlyDestinationIds
    ? { sourceIds: event.sourceId, _id: { $in: onlyDestinationIds } }
    : { sourceIds: event.sourceId };
  const destinations = await Destination.find(filter, { eventTypes: 1, paused: 1 }).lean();
  const matching = destinations.filter((d) => matchesEventType(d.eventTypes, event.eventType));
  const now = ctx.now();
  let created = 0;
  if (matching.length > 0) {
    try {
      const inserted = await Delivery.insertMany(
        matching.map((destination) => ({
          eventId: event._id,
          destinationId: destination._id,
          sourceId: event.sourceId,
          eventType: event.eventType,
          status: destination.paused ? "paused" : "pending",
          nextAttemptAt: now,
          createdAt: event.receivedAt,
          expiresAt: expiresAt(ctx, event.receivedAt),
        })),
        { ordered: false },
      );
      created = inserted.length;
    } catch (error) {
      const writeErrors = (error as { writeErrors?: { code?: number; err?: { code?: number } }[] })
        .writeErrors;
      const allDuplicates = writeErrors?.every((e) => (e.code ?? e.err?.code) === 11000);
      if (!allDuplicates) throw error;
      created = matching.length - writeErrors!.length;
    }
  }
  await Event.updateOne({ _id: event._id }, { $set: { fanoutPending: false } });
  return created;
}

// Finishes fan-out for events whose request died between saving the event and creating deliveries.
export async function resumeStaleFanouts(ctx: Context, olderThanMs = 30_000): Promise<number> {
  const cutoff = new Date(ctx.now().getTime() - olderThanMs);
  const stale = await Event.find(
    { fanoutPending: true, receivedAt: { $lt: cutoff } },
    { sourceId: 1, eventType: 1, receivedAt: 1 },
  )
    .limit(100)
    .lean();
  await Promise.all(stale.map((event) => fanout(ctx, event)));
  return stale.length;
}
