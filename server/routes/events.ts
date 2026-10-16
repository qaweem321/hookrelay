import { Router } from "express";
import type { Types } from "mongoose";
import type { DeliveryStatus, EventDetail, EventSummary, Page } from "../../shared/types";
import type { Context } from "../context";
import { toBuffer } from "../lib/bytes";
import { notFound, objectId, optionalObjectId } from "../lib/http";
import { Delivery, Destination, Event, Source, type EventDoc } from "../models";
import { fanout } from "../services/ingest";
import { emptyCounts, toDelivery } from "../services/serialize";

const PAGE_SIZE = 50;

type Named = { _id: Types.ObjectId; name: string };
const nameMap = (docs: Named[]) => new Map(docs.map((d) => [String(d._id), d.name]));
const sourceNames = async (ids: Types.ObjectId[]) =>
  nameMap(await Source.find({ _id: { $in: ids } }, { name: 1 }).lean<Named[]>());
const destinationNames = async (ids: Types.ObjectId[]) =>
  nameMap(await Destination.find({ _id: { $in: ids } }, { name: 1 }).lean<Named[]>());

const unique = (ids: Types.ObjectId[]) => [...new Map(ids.map((id) => [String(id), id])).values()];

type SummaryFields = Pick<EventDoc, "_id" | "sourceId" | "eventType" | "dedupeKey" | "size" | "receivedAt">;

const toSummary = (
  e: SummaryFields,
  sourceName: string | null,
  deliveries: Record<DeliveryStatus, number>,
): EventSummary => ({
  id: String(e._id),
  sourceId: String(e.sourceId),
  sourceName,
  eventType: e.eventType,
  dedupeKey: e.dedupeKey,
  size: e.size,
  receivedAt: e.receivedAt.toISOString(),
  deliveries,
});

export function eventRoutes(ctx: Context) {
  const router = Router();

  // Cursor pagination on _id (newest first): stable while new events arrive, and an index seek
  // instead of skip/offset. One query for the page, then names and delivery counts in parallel.
  router.get("/", async (req, res) => {
    const filter: Record<string, unknown> = {};
    const sourceId = optionalObjectId(req.query.sourceId);
    const before = optionalObjectId(req.query.before);
    if (sourceId) filter.sourceId = sourceId;
    if (typeof req.query.eventType === "string" && req.query.eventType)
      filter.eventType = req.query.eventType;
    if (before) filter._id = { $lt: before };

    const rows = await Event.find(filter, { sourceId: 1, eventType: 1, dedupeKey: 1, size: 1, receivedAt: 1 })
      .sort({ _id: -1 })
      .limit(PAGE_SIZE + 1)
      .lean<SummaryFields[]>();
    const page = rows.slice(0, PAGE_SIZE);
    const ids = page.map((e) => e._id);
    const [sourceNameById, counts] = await Promise.all([
      sourceNames(unique(page.map((e) => e.sourceId))),
      Delivery.aggregate<{ _id: { eventId: Types.ObjectId; status: DeliveryStatus }; n: number }>([
        { $match: { eventId: { $in: ids } } },
        { $group: { _id: { eventId: "$eventId", status: "$status" }, n: { $sum: 1 } } },
      ]),
    ]);
    const byEvent = new Map<string, Record<DeliveryStatus, number>>();
    for (const { _id, n } of counts) {
      const key = String(_id.eventId);
      const entry = byEvent.get(key) ?? emptyCounts();
      entry[_id.status] = n;
      byEvent.set(key, entry);
    }
    const body: Page<EventSummary> = {
      items: page.map((e) =>
        toSummary(
          e,
          sourceNameById.get(String(e.sourceId)) ?? null,
          byEvent.get(String(e._id)) ?? emptyCounts(),
        ),
      ),
      nextCursor: rows.length > PAGE_SIZE ? String(page.at(-1)!._id) : null,
    };
    res.json(body);
  });

  router.get("/types", async (_req, res) => {
    const types = await Event.distinct("eventType", { eventType: { $type: "string" } });
    res.json((types as string[]).sort().slice(0, 500));
  });

  router.get("/:id", async (req, res) => {
    const id = objectId(req.params.id, "Event not found");
    const [event, deliveries] = await Promise.all([
      Event.findById(id).lean(),
      Delivery.find({ eventId: id }).sort({ _id: 1 }).lean(),
    ]);
    if (!event) throw notFound("Event not found");
    const [sourceNameById, destinationNameById] = await Promise.all([
      sourceNames([event.sourceId]),
      destinationNames(unique(deliveries.map((d) => d.destinationId))),
    ]);
    const counts = emptyCounts();
    for (const d of deliveries) counts[d.status]++;
    const body = toBuffer(event.body);
    const text = body.toString("utf8");
    const isText = Buffer.from(text, "utf8").equals(body);
    const detail: EventDetail = {
      ...toSummary(event, sourceNameById.get(String(event.sourceId)) ?? null, counts),
      contentType: event.contentType,
      headers: event.headers,
      body: isText ? text : body.toString("base64"),
      bodyEncoding: isText ? "utf8" : "base64",
      deliveryList: deliveries.map((d) =>
        toDelivery(d, destinationNameById.get(String(d.destinationId)) ?? null),
      ),
    };
    res.json(detail);
  });

  // Sends the event again to every destination: finished deliveries are re-queued with a fresh
  // set of attempts, and destinations added since the event arrived get their first delivery.
  router.post("/:id/replay", async (req, res) => {
    const id = objectId(req.params.id, "Event not found");
    const event = await Event.findById(id, { sourceId: 1, eventType: 1, receivedAt: 1 }).lean();
    if (!event) throw notFound("Event not found");
    const [requeued, created] = await Promise.all([
      Delivery.updateMany(
        { eventId: id, status: { $in: ["succeeded", "dead"] } },
        { $set: { status: "pending", attemptCount: 0, nextAttemptAt: ctx.now(), completedAt: null } },
      ),
      fanout(ctx, event),
    ]);
    res.json({ requeued: requeued.modifiedCount, created });
  });

  return router;
}
