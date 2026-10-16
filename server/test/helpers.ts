import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { createApp } from "../app";
import { createContext, type Context } from "../context";
import { connectDb } from "../db";
import { loadEnv } from "../env";

export const TEST_KEY = "a".repeat(64);

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: "test",
    MONGO_URL: "mongodb://unused",
    APP_URL: "http://hookrelay.test",
    ENCRYPTION_KEY: TEST_KEY,
    ALLOW_HTTP_DESTINATIONS: "true",
    DESTINATION_ALLOW_HOSTS: "127.0.0.1,localhost",
    LOG_LEVEL: "silent",
    ...overrides,
  });
}

// Connects to a fresh database for this test file and empties it before each test.
export function useDatabase() {
  beforeAll(async () => {
    const base = new URL(inject("mongoUrl"));
    base.pathname = `/hookrelay_test_${randomBytes(6).toString("hex")}`;
    await connectDb(base.toString());
  });
  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
}

export function testApp(overrides: Partial<Context> = {}, envOverrides: Record<string, string> = {}) {
  const ctx = { ...createContext(testEnv(envOverrides)), ...overrides };
  return { ctx, app: createApp(ctx, pino({ level: "silent" })) };
}

// An agent with a logged-in session and the CSRF header on every write.
export async function loggedIn(app: ReturnType<typeof createApp>, email = "owner@example.com") {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/setup")
    .set("x-requested-with", "hookrelay")
    .send({ email, password: "correct horse battery" })
    .expect(201);
  const send = (method: "post" | "patch" | "delete", url: string) =>
    agent[method](url).set("x-requested-with", "hookrelay");
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string) => send("post", url),
    patch: (url: string) => send("patch", url),
    del: (url: string) => send("delete", url),
  };
}

export type Received = { headers: IncomingMessage["headers"]; body: string };

// A local webhook receiver that answers with the queued status codes (then 200).
export async function receiver(statuses: number[] = []) {
  const received: Received[] = [];
  const queue = [...statuses];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.statusCode = queue.shift() ?? 200;
      res.end(res.statusCode < 300 ? "ok" : "nope");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
