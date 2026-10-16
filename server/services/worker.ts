import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "pino";
import type { Context } from "../context";
import { retryDelayMs } from "../lib/backoff";
import { toBuffer } from "../lib/bytes";
import { decryptSecret } from "../lib/crypto";
import { Delivery, Destination, Event, type DeliveryDoc } from "../models";
import { attemptDelivery } from "./deliver";
import { resumeStaleFanouts } from "./ingest";

// A claimed delivery is reserved for this long beyond its timeout. If the worker dies mid-send,
// another worker picks it up once the lease runs out.
const LEASE_MARGIN_MS = 30_000;
const MAX_TIMEOUT_MS = 30_000;
// Manual retries reset the attempt budget, so the log is capped to keep documents small.
const MAX_ATTEMPT_LOG = 50;

// Atomically takes the next due delivery: pending and due, or stuck "delivering" with an
// expired lease. findOneAndUpdate makes this safe with any number of worker processes.
export async function claimNext(ctx: Context): Promise<DeliveryDoc | null> {
  const now = ctx.now();
  return Delivery.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        { status: "delivering", lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: "delivering", lockedUntil: new Date(now.getTime() + MAX_TIMEOUT_MS + LEASE_MARGIN_MS) },
    },
    { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
  ).lean<DeliveryDoc>();
}

// Sends one claimed delivery and records the result. The final update only applies while we
// still hold the lease, so a retry clicked in the dashboard meanwhile isn't overwritten.
export async function processDelivery(ctx: Context, delivery: DeliveryDoc): Promise<DeliveryDoc["status"]> {
  const [event, destination] = await Promise.all([
    Event.findById(delivery.eventId, { body: 1, contentType: 1 }).lean(),
    Destination.findById(delivery.destinationId, {
      url: 1,
      secretEnc: 1,
      paused: 1,
      maxAttempts: 1,
      timeoutMs: 1,
    }).lean(),
  ]);
  const held = { _id: delivery._id, status: "delivering" as const, lockedUntil: delivery.lockedUntil };

  if (destination?.paused) {
    await Delivery.updateOne(held, { $set: { status: "paused", lockedUntil: null } });
    return "paused";
  }
  if (!event || !destination) {
    const error = event ? "Destination was deleted" : "Event expired or was deleted";
    const attempt = { at: ctx.now(), durationMs: 0, responseStatus: null, error, responseBody: null };
    await Delivery.updateOne(held, {
      $set: { status: "dead", lockedUntil: null, nextAttemptAt: null, completedAt: ctx.now() },
      $push: { attempts: { $each: [attempt], $slice: -MAX_ATTEMPT_LOG } },
    });
    return "dead";
  }

  const outcome = await attemptDelivery(
    ctx,
    delivery,
    { ...event, body: toBuffer(event.body) },
    {
      url: destination.url,
      secret: decryptSecret(destination.secretEnc, ctx.key),
      timeoutMs: Math.min(destination.timeoutMs, MAX_TIMEOUT_MS),
    },
  );
  const attemptCount = delivery.attemptCount + 1;
  const done = outcome.ok || attemptCount >= destination.maxAttempts;
  const status = outcome.ok ? "succeeded" : done ? "dead" : "pending";
  const nextAttemptAt = done
    ? null
    : new Date(ctx.now().getTime() + retryDelayMs(attemptCount, Math.random, outcome.retryAfterMs));
  await Delivery.updateOne(held, {
    $set: { status, attemptCount, nextAttemptAt, lockedUntil: null, completedAt: done ? ctx.now() : null },
    $push: { attempts: { $each: [outcome.attempt], $slice: -MAX_ATTEMPT_LOG } },
  });
  return status;
}

export type WorkerHandle = { stop: () => Promise<void> };

export function startWorker(
  ctx: Context,
  logger: Logger,
  options: { pollMs?: number; sweepMs?: number } = {},
): WorkerHandle {
  const pollMs = options.pollMs ?? 1_000;
  const sweepMs = options.sweepMs ?? 30_000;
  const controller = new AbortController();
  const { signal } = controller;

  // Each lane works through due deliveries back to back and only sleeps when the queue is empty.
  async function lane() {
    while (!signal.aborted) {
      try {
        const delivery = await claimNext(ctx);
        if (!delivery) {
          await sleep(pollMs, undefined, { signal }).catch(() => {});
          continue;
        }
        const status = await processDelivery(ctx, delivery);
        logger.debug({ deliveryId: String(delivery._id), status }, "delivery processed");
      } catch (error) {
        logger.error({ err: error }, "worker lane error");
        await sleep(pollMs, undefined, { signal }).catch(() => {});
      }
    }
  }

  async function sweeper() {
    while (!signal.aborted) {
      try {
        const resumed = await resumeStaleFanouts(ctx);
        if (resumed > 0) logger.warn({ resumed }, "resumed fan-out for interrupted events");
      } catch (error) {
        logger.error({ err: error }, "fan-out sweep failed");
      }
      await sleep(sweepMs, undefined, { signal }).catch(() => {});
    }
  }

  const running = Promise.all([...Array.from({ length: ctx.env.WORKER_CONCURRENCY }, lane), sweeper()]);
  logger.info({ concurrency: ctx.env.WORKER_CONCURRENCY }, "delivery worker started");
  return {
    // Stops claiming new work and waits for in-flight deliveries to finish.
    stop: async () => {
      controller.abort();
      await running;
    },
  };
}
