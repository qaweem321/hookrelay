// Shapes shared by the API and the dashboard.

export const PROVIDERS = ["github", "stripe", "standard", "hmac", "none"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  github: "GitHub",
  stripe: "Stripe",
  standard: "Standard Webhooks (Svix, Clerk, Resend...)",
  hmac: "Custom HMAC-SHA256 header",
  none: "No signature check",
};

export const DELIVERY_STATUSES = ["pending", "delivering", "succeeded", "dead", "paused"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type User = { id: string; email: string; createdAt: string };

export type AuthState = { setupRequired: boolean; user: { id: string; email: string } | null };

export type HmacConfig = { header: string; encoding: "hex" | "base64"; prefix: string };

export type Source = {
  id: string;
  name: string;
  provider: Provider;
  hmac: HmacConfig;
  hasSecret: boolean;
  ingestUrl: string;
  rejectedCount: number;
  lastRejectedAt: string | null;
  lastRejectedReason: string | null;
  createdAt: string;
};

export type Destination = {
  id: string;
  name: string;
  url: string;
  sourceIds: string[];
  eventTypes: string[];
  paused: boolean;
  maxAttempts: number;
  timeoutMs: number;
  createdAt: string;
};

export type Attempt = {
  at: string;
  durationMs: number;
  responseStatus: number | null;
  error: string | null;
  responseBody: string | null;
};

export type Delivery = {
  id: string;
  eventId: string;
  destinationId: string;
  destinationName: string | null;
  sourceId: string;
  eventType: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  attempts: Attempt[];
};

export type EventSummary = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  eventType: string | null;
  dedupeKey: string | null;
  size: number;
  receivedAt: string;
  deliveries: Record<DeliveryStatus, number>;
};

export type EventDetail = EventSummary & {
  contentType: string | null;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
  deliveryList: Delivery[];
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type Stats = {
  events24h: number;
  succeeded24h: number;
  dead24h: number;
  pending: number;
  successRate: number | null;
  hourly: { hour: string; events: number; succeeded: number; failed: number }[];
};
