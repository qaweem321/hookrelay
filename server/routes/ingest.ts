import express, { Router } from "express";
import type { Context } from "../context";
import type { Headers } from "../lib/inbound";
import { Source } from "../models";
import { receive } from "../services/ingest";

// Public endpoint providers send webhooks to: POST /in/<source slug>. The body is kept as raw
// bytes, because signatures are computed over the exact bytes sent.
export function ingestRoutes(ctx: Context) {
  const router = Router();
  router.post(
    "/:slug",
    express.raw({ type: () => true, limit: ctx.env.MAX_PAYLOAD_BYTES }),
    async (req, res) => {
      const source = await Source.findOne({ slug: req.params.slug }).lean();
      if (!source) {
        res.status(404).json({ error: "Unknown source" });
        return;
      }
      const headers: Headers = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await receive(ctx, source, headers, body);
      if (result.status === 401) res.status(401).json({ error: result.error });
      else
        res
          .status(result.status)
          .json(result.status === 200 ? { id: result.eventId, duplicate: true } : { id: result.eventId });
    },
  );
  return router;
}
