import { Router } from "express";
import { Types } from "mongoose";
import { checkUrl } from "@qaweem321/no-ssrf";
import { destinationInput } from "../../shared/schemas";
import type { Context } from "../context";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { HttpError, notFound, objectId } from "../lib/http";
import { newSigningSecret } from "../lib/standard-webhooks";
import { Delivery, Destination } from "../models";
import { toDestination } from "../services/serialize";

export function destinationRoutes(ctx: Context) {
  const router = Router();

  // Early, friendly feedback. The worker checks again (DNS included) on every send.
  function parse(body: unknown) {
    const input = destinationInput.parse(body);
    const verdict = checkUrl(input.url, {
      allowHttp: ctx.env.ALLOW_HTTP_DESTINATIONS,
      allowHosts: ctx.env.DESTINATION_ALLOW_HOSTS,
    });
    if (!verdict.ok) throw new HttpError(400, `That URL can't be used: ${verdict.reason}.`);
    return { ...input, sourceIds: [...new Set(input.sourceIds)].map((id) => new Types.ObjectId(id)) };
  }

  const find = async (id: unknown) => {
    const destination = await Destination.findById(objectId(id)).lean();
    if (!destination) throw notFound("Destination not found");
    return destination;
  };

  router.get("/", async (_req, res) => {
    const destinations = await Destination.find().sort({ createdAt: -1 }).lean();
    res.json(destinations.map(toDestination));
  });

  router.post("/", async (req, res) => {
    const destination = await Destination.create({
      ...parse(req.body),
      secretEnc: encryptSecret(newSigningSecret(), ctx.key),
    });
    res.status(201).json(toDestination(destination.toObject()));
  });

  router.get("/:id", async (req, res) => res.json(toDestination(await find(req.params.id))));

  router.patch("/:id", async (req, res) => {
    const destination = await Destination.findByIdAndUpdate(
      objectId(req.params.id),
      { $set: parse(req.body) },
      {
        returnDocument: "after",
      },
    ).lean();
    if (!destination) throw notFound("Destination not found");
    res.json(toDestination(destination));
  });

  router.delete("/:id", async (req, res) => {
    const id = objectId(req.params.id);
    const [deleted] = await Promise.all([
      Destination.deleteOne({ _id: id }),
      Delivery.deleteMany({ destinationId: id }),
    ]);
    if (deleted.deletedCount === 0) throw notFound("Destination not found");
    res.status(204).end();
  });

  router.get("/:id/secret", async (req, res) => {
    const destination = await find(req.params.id);
    res.json({ secret: decryptSecret(destination.secretEnc, ctx.key) });
  });

  router.post("/:id/rotate-secret", async (req, res) => {
    const secret = newSigningSecret();
    const updated = await Destination.updateOne(
      { _id: objectId(req.params.id) },
      { $set: { secretEnc: encryptSecret(secret, ctx.key) } },
    );
    if (updated.matchedCount === 0) throw notFound("Destination not found");
    res.json({ secret });
  });

  // Pausing parks queued deliveries; resuming sends them right away.
  router.post("/:id/pause", async (req, res) => {
    const id = objectId(req.params.id);
    const updated = await Destination.updateOne({ _id: id }, { $set: { paused: true } });
    if (updated.matchedCount === 0) throw notFound("Destination not found");
    await Delivery.updateMany({ destinationId: id, status: "pending" }, { $set: { status: "paused" } });
    res.status(204).end();
  });

  router.post("/:id/resume", async (req, res) => {
    const id = objectId(req.params.id);
    const updated = await Destination.updateOne({ _id: id }, { $set: { paused: false } });
    if (updated.matchedCount === 0) throw notFound("Destination not found");
    await Delivery.updateMany(
      { destinationId: id, status: "paused" },
      { $set: { status: "pending", nextAttemptAt: ctx.now() } },
    );
    res.status(204).end();
  });

  // Gives every dead delivery a fresh set of attempts, e.g. after fixing a broken endpoint.
  router.post("/:id/retry-dead", async (req, res) => {
    const destination = await find(req.params.id);
    const result = await Delivery.updateMany(
      { destinationId: destination._id, status: "dead" },
      {
        $set: {
          status: destination.paused ? "paused" : "pending",
          attemptCount: 0,
          nextAttemptAt: ctx.now(),
          completedAt: null,
        },
      },
    );
    res.json({ retried: result.modifiedCount });
  });

  return router;
}
