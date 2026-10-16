import type { Attempt, Delivery, DeliveryStatus, Destination, Source, User } from "../../shared/types";
import type { DeliveryDoc, DestinationDoc, SourceDoc, UserDoc } from "../models";

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export const toUser = (u: Pick<UserDoc, "_id" | "email" | "createdAt">): User => ({
  id: String(u._id),
  email: u.email,
  createdAt: u.createdAt.toISOString(),
});

export const toSource = (s: SourceDoc, appUrl: string): Source => ({
  id: String(s._id),
  name: s.name,
  provider: s.provider,
  hmac: { header: s.hmac.header, encoding: s.hmac.encoding, prefix: s.hmac.prefix },
  hasSecret: Boolean(s.secretEnc),
  ingestUrl: new URL(`/in/${s.slug}`, appUrl).toString(),
  rejectedCount: s.rejectedCount,
  lastRejectedAt: iso(s.lastRejectedAt),
  lastRejectedReason: s.lastRejectedReason,
  createdAt: s.createdAt.toISOString(),
});

export const toDestination = (d: DestinationDoc): Destination => ({
  id: String(d._id),
  name: d.name,
  url: d.url,
  sourceIds: d.sourceIds.map(String),
  eventTypes: d.eventTypes,
  paused: d.paused,
  maxAttempts: d.maxAttempts,
  timeoutMs: d.timeoutMs,
  createdAt: d.createdAt.toISOString(),
});

export const toDelivery = (d: DeliveryDoc, destinationName: string | null): Delivery => ({
  id: String(d._id),
  eventId: String(d.eventId),
  destinationId: String(d.destinationId),
  destinationName,
  sourceId: String(d.sourceId),
  eventType: d.eventType,
  status: d.status,
  attemptCount: d.attemptCount,
  nextAttemptAt: iso(d.nextAttemptAt),
  completedAt: iso(d.completedAt),
  createdAt: d.createdAt.toISOString(),
  attempts: (d.attempts ?? []).map((a): Attempt => ({
    at: a.at.toISOString(),
    durationMs: a.durationMs,
    responseStatus: a.responseStatus ?? null,
    error: a.error ?? null,
    responseBody: a.responseBody ?? null,
  })),
});

export const emptyCounts = (): Record<DeliveryStatus, number> => ({
  pending: 0,
  delivering: 0,
  succeeded: 0,
  dead: 0,
  paused: 0,
});
