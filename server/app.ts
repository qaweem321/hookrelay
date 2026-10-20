import { existsSync } from "node:fs";
import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";
import type { Context } from "./context";
import { HttpError } from "./lib/http";
import { loadUser, requireCsrfHeader, requireUser } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { deliveryRoutes } from "./routes/deliveries";
import { destinationRoutes } from "./routes/destinations";
import { eventRoutes } from "./routes/events";
import { ingestRoutes } from "./routes/ingest";
import { sourceRoutes } from "./routes/sources";
import { statsRoutes } from "./routes/stats";
import { userRoutes } from "./routes/users";

export function createApp(ctx: Context, logger: Logger, options: { webDist?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (ctx.env.TRUST_PROXY) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(compression());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  app.get("/api/health", async (_req, res) => {
    const ok =
      mongoose.connection.readyState === 1 &&
      (await mongoose.connection.db
        ?.admin()
        .ping()
        .then(
          () => true,
          () => false,
        ));
    res.status(ok ? 200 : 503).json({ ok });
  });

  app.use("/in", ingestRoutes(ctx));

  const api = express.Router();
  api.use(express.json({ limit: "100kb" }), cookieParser(), requireCsrfHeader, loadUser);
  api.use("/auth", authRoutes(ctx));
  api.use(requireUser);
  api.use("/users", userRoutes());
  api.use("/sources", sourceRoutes(ctx));
  api.use("/destinations", destinationRoutes(ctx));
  api.use("/events", eventRoutes(ctx));
  api.use("/deliveries", deliveryRoutes(ctx));
  api.use("/stats", statsRoutes(ctx));
  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use("/api", api);

  // The built dashboard: static assets plus index.html for every client-side route. Only the
  // hashed files in /assets are cached for good; the rest (favicon, theme.js) are revalidated.
  const webDist = options.webDist;
  if (webDist && existsSync(path.join(webDist, "index.html"))) {
    app.use("/assets", express.static(path.join(webDist, "assets"), { maxAge: "1y", immutable: true }));
    app.use(express.static(webDist, { index: false }));
    app.get("/{*path}", (_req, res) => {
      res.set("cache-control", "no-cache").sendFile(path.join(webDist, "index.html"));
    });
  }

  const onError: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      res.status(400).json({ error: first ? first.message : "Invalid input", issues: error.issues });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const status = typeof error?.status === "number" && error.status < 500 ? error.status : 500;
    if (status === 413) {
      res.status(413).json({ error: "Payload too large" });
      return;
    }
    if (status < 500) {
      res.status(status).json({ error: error.message ?? "Bad request" });
      return;
    }
    req.log.error({ err: error }, "unhandled error");
    res.status(500).json({ error: "Something went wrong on our side." });
  };
  app.use(onError);
  return app;
}
