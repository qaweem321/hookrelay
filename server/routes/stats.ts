import { Router } from "express";
import type { Stats } from "../../shared/types";
import type { Context } from "../context";
import { Delivery, Event } from "../models";

const HOUR_MS = 60 * 60 * 1000;

// Dashboard numbers for the last 24 hours, from five queries run in parallel.
export async function stats(ctx: Context): Promise<Stats> {
  const now = ctx.now();
  const since = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - 23 * HOUR_MS);
  const byHour = (field: string) => ({ $dateTrunc: { date: field, unit: "hour", timezone: "UTC" } });

  const [events24h, pending, outcomes, eventHours, deliveryHours] = await Promise.all([
    Event.countDocuments({ receivedAt: { $gte: since } }),
    Delivery.countDocuments({ status: { $in: ["pending", "delivering"] } }),
    Delivery.aggregate<{ _id: string; n: number }>([
      { $match: { completedAt: { $gte: since } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Event.aggregate<{ _id: Date; n: number }>([
      { $match: { receivedAt: { $gte: since } } },
      { $group: { _id: byHour("$receivedAt"), n: { $sum: 1 } } },
    ]),
    Delivery.aggregate<{ _id: { hour: Date; status: string }; n: number }>([
      { $match: { completedAt: { $gte: since } } },
      { $group: { _id: { hour: byHour("$completedAt"), status: "$status" }, n: { $sum: 1 } } },
    ]),
  ]);

  const succeeded24h = outcomes.find((o) => o._id === "succeeded")?.n ?? 0;
  const dead24h = outcomes.find((o) => o._id === "dead")?.n ?? 0;
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    hour: new Date(since.getTime() + i * HOUR_MS).toISOString(),
    events: 0,
    succeeded: 0,
    failed: 0,
  }));
  const slot = (date: Date) => hourly[Math.round((date.getTime() - since.getTime()) / HOUR_MS)];
  for (const row of eventHours) {
    const entry = slot(row._id);
    if (entry) entry.events = row.n;
  }
  for (const row of deliveryHours) {
    const entry = slot(row._id.hour);
    if (!entry) continue;
    if (row._id.status === "succeeded") entry.succeeded += row.n;
    if (row._id.status === "dead") entry.failed += row.n;
  }
  const finished = succeeded24h + dead24h;
  return {
    events24h,
    succeeded24h,
    dead24h,
    pending,
    successRate: finished === 0 ? null : succeeded24h / finished,
    hourly,
  };
}

export function statsRoutes(ctx: Context) {
  return Router().get("/", async (_req, res) => {
    res.json(await stats(ctx));
  });
}
