import { Router } from "express";
import { sourceInput } from "../../shared/schemas";
import type { Context } from "../context";
import { encryptSecret, randomToken } from "../lib/crypto";
import { notFound, objectId } from "../lib/http";
import { Delivery, Destination, Event, Source } from "../models";
import { receive } from "../services/ingest";
import { toSource } from "../services/serialize";

export function sourceRoutes(ctx: Context) {
  const router = Router();
  const seal = (secret: string | undefined) =>
    secret === undefined ? undefined : secret === "" ? null : encryptSecret(secret, ctx.key);

  router.get("/", async (_req, res) => {
    const sources = await Source.find().sort({ createdAt: -1 }).lean();
    res.json(sources.map((s) => toSource(s, ctx.env.APP_URL)));
  });

  router.post("/", async (req, res) => {
    const input = sourceInput.parse(req.body);
    const source = await Source.create({
      name: input.name,
      provider: input.provider,
      hmac: input.hmac,
      secretEnc: seal(input.secret) ?? null,
      slug: randomToken("src_", 18),
    });
    res.status(201).json(toSource(source.toObject(), ctx.env.APP_URL));
  });

  router.get("/:id", async (req, res) => {
    const source = await Source.findById(objectId(req.params.id)).lean();
    if (!source) throw notFound("Source not found");
    res.json(toSource(source, ctx.env.APP_URL));
  });

  router.patch("/:id", async (req, res) => {
    const input = sourceInput.parse(req.body);
    const secretEnc = seal(input.secret);
    const source = await Source.findByIdAndUpdate(
      objectId(req.params.id),
      {
        $set: {
          name: input.name,
          provider: input.provider,
          hmac: input.hmac,
          ...(secretEnc !== undefined && { secretEnc }),
        },
      },
      { returnDocument: "after" },
    ).lean();
    if (!source) throw notFound("Source not found");
    res.json(toSource(source, ctx.env.APP_URL));
  });

  // Removes the source with its events and deliveries, and unlinks it from destinations.
  router.delete("/:id", async (req, res) => {
    const id = objectId(req.params.id);
    const [deleted] = await Promise.all([
      Source.deleteOne({ _id: id }),
      Event.deleteMany({ sourceId: id }),
      Delivery.deleteMany({ sourceId: id }),
      Destination.updateMany({ sourceIds: id }, { $pull: { sourceIds: id } }),
    ]);
    if (deleted.deletedCount === 0) throw notFound("Source not found");
    res.status(204).end();
  });

  // Sends a sample event through the pipeline (skipping the signature check) to test destinations.
  router.post("/:id/test", async (req, res) => {
    const source = await Source.findById(objectId(req.params.id)).lean();
    if (!source) throw notFound("Source not found");
    const now = ctx.now();
    const body = Buffer.from(
      JSON.stringify({
        type: "hookrelay.test",
        id: randomToken("evt_test_", 12),
        createdAt: now.toISOString(),
        data: { message: "Hello from Hookrelay" },
      }),
    );
    const result = await receive(
      ctx,
      source,
      { "content-type": "application/json", "user-agent": "Hookrelay test" },
      body,
      {
        skipVerification: true,
      },
    );
    res.status(201).json(result);
  });

  return router;
}
