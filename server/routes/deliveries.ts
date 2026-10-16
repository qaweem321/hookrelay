import { Router } from "express";
import type { Types } from "mongoose";
import { DELIVERY_STATUSES, type Delivery as DeliveryDto, type Page } from "../../shared/types";
import type { Context } from "../context";
import { HttpError, objectId, optionalObjectId } from "../lib/http";
import { Delivery, Destination, type DeliveryDoc } from "../models";
import { toDelivery } from "../services/serialize";

const PAGE_SIZE = 50;

export function deliveryRoutes(ctx: Context) {
  const router = Router();

  router.get("/", async (req, res) => {
    const filter: Record<string, unknown> = {};
    const destinationId = optionalObjectId(req.query.destinationId);
    const before = optionalObjectId(req.query.before);
    const status = DELIVERY_STATUSES.find((s) => s === req.query.status);
    if (destinationId) filter.destinationId = destinationId;
    if (status) filter.status = status;
    if (before) filter._id = { $lt: before };

    // Only the latest attempt is needed for the list.
    const rows = await Delivery.find(filter, { attempts: { $slice: -1 } })
      .sort({ _id: -1 })
      .limit(PAGE_SIZE + 1)
      .lean<DeliveryDoc[]>();
    const page = rows.slice(0, PAGE_SIZE);
    const destinationIds = [...new Set(page.map((d) => String(d.destinationId)))];
    const destinations = await Destination.find({ _id: { $in: destinationIds } }, { name: 1 }).lean<
      { _id: Types.ObjectId; name: string }[]
    >();
    const nameById = new Map(destinations.map((d) => [String(d._id), d.name]));
    const body: Page<DeliveryDto> = {
      items: page.map((d) => toDelivery(d, nameById.get(String(d.destinationId)) ?? null)),
      nextCursor: rows.length > PAGE_SIZE ? String(page.at(-1)!._id) : null,
    };
    res.json(body);
  });

  router.post("/:id/retry", async (req, res) => {
    const result = await Delivery.updateOne(
      { _id: objectId(req.params.id, "Delivery not found"), status: { $in: ["succeeded", "dead"] } },
      { $set: { status: "pending", attemptCount: 0, nextAttemptAt: ctx.now(), completedAt: null } },
    );
    if (result.matchedCount === 0)
      throw new HttpError(409, "This delivery is already queued or doesn't exist.");
    res.status(204).end();
  });

  return router;
}
