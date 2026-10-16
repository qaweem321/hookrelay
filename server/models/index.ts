import mongoose, { Schema, type Types } from "mongoose";
import {
  DELIVERY_STATUSES,
  PROVIDERS,
  type DeliveryStatus,
  type HmacConfig,
  type Provider,
} from "../../shared/types";

const { model } = mongoose;
const opts = { versionKey: false } as const;

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
export const User = model<UserDoc>(
  "User",
  new Schema<UserDoc>(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
);

// The cookie holds a random token; only its SHA-256 hash is stored, so a database leak can't be
// replayed as a login. Expired sessions are removed by a TTL index.
export interface SessionDoc {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  email: string;
  expiresAt: Date;
  createdAt: Date;
}
export const Session = model<SessionDoc>(
  "Session",
  new Schema<SessionDoc>(
    {
      tokenHash: { type: String, required: true, unique: true },
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      email: { type: String, required: true },
      expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
);

// Single-document markers, e.g. "setup" once the first account exists. Inserting one is atomic,
// so two people racing through the setup page can't both become the first user.
export interface MarkerDoc {
  _id: string;
  at: Date;
}
export const Marker = model<MarkerDoc>(
  "Marker",
  new Schema<MarkerDoc>({ _id: String, at: { type: Date, default: () => new Date() } }, opts),
);

export interface SourceDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  provider: Provider;
  secretEnc: string | null;
  hmac: HmacConfig;
  rejectedCount: number;
  lastRejectedAt: Date | null;
  lastRejectedReason: string | null;
  createdAt: Date;
}
export const Source = model<SourceDoc>(
  "Source",
  new Schema<SourceDoc>(
    {
      name: { type: String, required: true, trim: true },
      slug: { type: String, required: true, unique: true },
      provider: { type: String, enum: PROVIDERS, required: true },
      secretEnc: { type: String, default: null },
      hmac: {
        header: { type: String, default: "x-signature" },
        encoding: { type: String, enum: ["hex", "base64"], default: "hex" },
        prefix: { type: String, default: "" },
      },
      rejectedCount: { type: Number, default: 0 },
      lastRejectedAt: { type: Date, default: null },
      lastRejectedReason: { type: String, default: null },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
);

export interface DestinationDoc {
  _id: Types.ObjectId;
  name: string;
  url: string;
  sourceIds: Types.ObjectId[];
  eventTypes: string[];
  secretEnc: string;
  paused: boolean;
  maxAttempts: number;
  timeoutMs: number;
  createdAt: Date;
}
export const Destination = model<DestinationDoc>(
  "Destination",
  new Schema<DestinationDoc>(
    {
      name: { type: String, required: true, trim: true },
      url: { type: String, required: true },
      sourceIds: { type: [Schema.Types.ObjectId], default: [], index: true },
      eventTypes: { type: [String], default: [] },
      secretEnc: { type: String, required: true },
      paused: { type: Boolean, default: false },
      maxAttempts: { type: Number, default: 8 },
      timeoutMs: { type: Number, default: 10_000 },
      createdAt: { type: Date, default: () => new Date() },
    },
    opts,
  ),
);

export interface EventDoc {
  _id: Types.ObjectId;
  sourceId: Types.ObjectId;
  dedupeKey: string | null;
  eventType: string | null;
  contentType: string | null;
  headers: Record<string, string>;
  body: Buffer;
  size: number;
  receivedAt: Date;
  // True until deliveries exist for every matching destination. The worker re-runs fan-out for
  // events left like this by a crash between the two writes.
  fanoutPending: boolean;
  expiresAt: Date;
}
const eventSchema = new Schema<EventDoc>(
  {
    sourceId: { type: Schema.Types.ObjectId, required: true },
    dedupeKey: { type: String, default: null },
    eventType: { type: String, default: null },
    contentType: { type: String, default: null },
    headers: { type: Schema.Types.Mixed, default: {} },
    // Not `required`: Mongoose treats an empty buffer as missing, and empty webhooks are valid.
    body: { type: Buffer, default: () => Buffer.alloc(0) },
    size: { type: Number, required: true },
    receivedAt: { type: Date, default: () => new Date() },
    fanoutPending: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  opts,
);
eventSchema.index(
  { sourceId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);
eventSchema.index({ sourceId: 1, _id: -1 });
eventSchema.index({ eventType: 1, _id: -1 });
eventSchema.index({ receivedAt: 1 });
eventSchema.index({ fanoutPending: 1, receivedAt: 1 }, { partialFilterExpression: { fanoutPending: true } });
export const Event = model<EventDoc>("Event", eventSchema);

export interface AttemptDoc {
  at: Date;
  durationMs: number;
  responseStatus: number | null;
  error: string | null;
  responseBody: string | null;
}

export interface DeliveryDoc {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  destinationId: Types.ObjectId;
  sourceId: Types.ObjectId;
  eventType: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  attempts: AttemptDoc[];
  nextAttemptAt: Date | null;
  lockedUntil: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}
const deliverySchema = new Schema<DeliveryDoc>(
  {
    eventId: { type: Schema.Types.ObjectId, required: true },
    destinationId: { type: Schema.Types.ObjectId, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    eventType: { type: String, default: null },
    status: { type: String, enum: DELIVERY_STATUSES, required: true },
    attemptCount: { type: Number, default: 0 },
    attempts: {
      type: [
        new Schema<AttemptDoc>(
          {
            at: Date,
            durationMs: Number,
            responseStatus: { type: Number, default: null },
            error: { type: String, default: null },
            responseBody: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    nextAttemptAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  opts,
);
deliverySchema.index({ eventId: 1, destinationId: 1 }, { unique: true });
deliverySchema.index({ status: 1, nextAttemptAt: 1 });
deliverySchema.index({ status: 1, lockedUntil: 1 });
deliverySchema.index({ destinationId: 1, status: 1, _id: -1 });
deliverySchema.index({ status: 1, _id: -1 });
deliverySchema.index({ completedAt: 1 }, { partialFilterExpression: { completedAt: { $type: "date" } } });
export const Delivery = model<DeliveryDoc>("Delivery", deliverySchema);

export const models = [User, Session, Marker, Source, Destination, Event, Delivery];
