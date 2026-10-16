import { createHmac } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { signature } from "../lib/standard-webhooks";
import { Delivery, Event, Source } from "../models";
import { resumeStaleFanouts } from "../services/ingest";
import { claimNext, processDelivery } from "../services/worker";
import { loggedIn, receiver, testApp, useDatabase } from "./helpers";

useDatabase();

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function setup(statuses: number[] = [], destination: Record<string, unknown> = {}) {
  let clock = new Date("2026-10-16T12:00:00Z");
  const { app, ctx } = testApp({ now: () => clock });
  const owner = await loggedIn(app);
  const hook = await receiver(statuses);
  closers.push(hook.close);
  const source = (
    await owner
      .post("/api/sources")
      .send({ name: "GitHub", provider: "github", secret: "gh-secret" })
      .expect(201)
  ).body;
  const dest = (
    await owner
      .post("/api/destinations")
      .send({ name: "API", url: hook.url, sourceIds: [source.id], ...destination })
      .expect(201)
  ).body;
  const slug = new URL(source.ingestUrl).pathname;
  const send = (payload: object, delivery = "d-1", event = "push") => {
    const body = JSON.stringify(payload);
    return request(app)
      .post(slug)
      .set("content-type", "application/json")
      .set("x-github-event", event)
      .set("x-github-delivery", delivery)
      .set("x-hub-signature-256", `sha256=${createHmac("sha256", "gh-secret").update(body).digest("hex")}`)
      .send(body);
  };
  // Runs every due delivery once, like one pass of the worker.
  const drain = async () => {
    const results = [];
    for (let d = await claimNext(ctx); d; d = await claimNext(ctx))
      results.push(await processDelivery(ctx, d));
    return results;
  };
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { app, ctx, owner, hook, source, dest, slug, send, drain, advance };
}

describe("ingest", () => {
  it("stores a signed webhook, answers 202 and queues one delivery per destination", async () => {
    const { send, owner } = await setup();
    const res = await send({ ref: "main" }).expect(202);
    const event = await owner.get(`/api/events/${res.body.id}`).expect(200);
    expect(event.body).toMatchObject({
      eventType: "push",
      dedupeKey: "d-1",
      body: '{"ref":"main"}',
      bodyEncoding: "utf8",
      deliveries: { pending: 1 },
    });
    expect(await Event.countDocuments({ fanoutPending: true })).toBe(0);
  });

  it("rejects bad signatures without storing them, and counts them on the source", async () => {
    const { app, slug, owner, source } = await setup();
    const res = await request(app).post(slug).set("x-hub-signature-256", "sha256=00").send("{}").expect(401);
    expect(res.body.error).toBe("Signature check failed: signature mismatch");
    expect(await Event.countDocuments()).toBe(0);
    const after = await owner.get(`/api/sources/${source.id}`).expect(200);
    expect(after.body).toMatchObject({ rejectedCount: 1, lastRejectedReason: "signature mismatch" });
  });

  it("drops provider retries of the same event", async () => {
    const { send } = await setup();
    const first = await send({ n: 1 }).expect(202);
    const again = await send({ n: 1 }).expect(200);
    expect(again.body).toEqual({ id: first.body.id, duplicate: true });
    expect(await Delivery.countDocuments()).toBe(1);
  });

  it("answers 404 for unknown sources and 413 for oversized bodies", async () => {
    const { app, slug } = await setup();
    await request(app).post("/in/src_nope").send("{}").expect(404);
    await request(app)
      .post(slug)
      .set("content-type", "application/json")
      .send("x".repeat(1_100_000))
      .expect(413);
  });

  it("accepts webhooks with an empty body", async () => {
    const { app, owner } = await setup();
    const { body } = await owner.post("/api/sources").send({ name: "Open", provider: "none" }).expect(201);
    const res = await request(app)
      .post(new URL(body.ingestUrl).pathname)
      .set("content-type", "application/json")
      .expect(202);
    expect((await owner.get(`/api/events/${res.body.id}`).expect(200)).body).toMatchObject({
      body: "",
      size: 0,
    });
  });

  it("redacts credentials in stored headers", async () => {
    const { send, owner } = await setup();
    const res = await send({}).set("authorization", "Bearer secret-token").expect(202);
    const event = await owner.get(`/api/events/${res.body.id}`).expect(200);
    expect(event.body.headers.authorization).toBe("[redacted]");
  });

  it("only routes event types the destination subscribed to", async () => {
    const { send } = await setup([], { eventTypes: ["pull_request", "issues.*"] });
    await send({}, "d-1", "push").expect(202);
    await send({}, "d-2", "pull_request").expect(202);
    expect(await Delivery.countDocuments()).toBe(1);
  });

  it("finishes fan-out for events interrupted mid-request", async () => {
    const { ctx, source, advance } = await setup();
    await Event.create({
      sourceId: source.id,
      eventType: "push",
      body: Buffer.from("{}"),
      size: 2,
      receivedAt: ctx.now(),
      expiresAt: new Date("2027-01-01"),
    });
    expect(await resumeStaleFanouts(ctx)).toBe(0);
    advance(60_000);
    expect(await resumeStaleFanouts(ctx)).toBe(1);
    expect(await Delivery.countDocuments()).toBe(1);
    expect(await resumeStaleFanouts(ctx)).toBe(0);
  });
});

describe("delivery", () => {
  it("delivers the original body with a Standard Webhooks signature", async () => {
    const { send, drain, hook, owner, dest } = await setup();
    await send({ ref: "main" }).expect(202);
    expect(await drain()).toEqual(["succeeded"]);
    const [got] = hook.received;
    expect(got!.body).toBe('{"ref":"main"}');
    expect(got!.headers).toMatchObject({
      "content-type": "application/json",
      "x-hookrelay-event-type": "push",
      "x-hookrelay-attempt": "1",
    });
    const { secret } = (await owner.get(`/api/destinations/${dest.id}/secret`).expect(200)).body;
    const id = String(got!.headers["webhook-id"]);
    const ts = Number(got!.headers["webhook-timestamp"]);
    expect(got!.headers["webhook-signature"]).toBe(signature(secret, id, ts, got!.body));
  });

  it("retries failures with backoff, then succeeds", async () => {
    const { send, drain, advance, hook } = await setup([500, 503]);
    await send({}).expect(202);
    expect(await drain()).toEqual(["pending"]);
    expect(await drain()).toEqual([]); // not due yet
    advance(13_000);
    expect(await drain()).toEqual(["pending"]);
    advance(80_000);
    expect(await drain()).toEqual(["succeeded"]);
    expect(hook.received.map((r) => r.headers["x-hookrelay-attempt"])).toEqual(["1", "2", "3"]);
    // The same webhook-id on every attempt, so receivers can deduplicate.
    expect(new Set(hook.received.map((r) => r.headers["webhook-id"])).size).toBe(1);
    const delivery = await Delivery.findOne().lean();
    expect(delivery!.attempts.map((a) => a.responseStatus)).toEqual([500, 503, 200]);
  });

  it("gives up after maxAttempts and can be retried by hand", async () => {
    const { send, drain, owner, advance } = await setup([500, 500, 500], { maxAttempts: 2 });
    await send({}).expect(202);
    await drain();
    advance(20_000);
    expect(await drain()).toEqual(["dead"]);
    const dead = await owner.get("/api/deliveries?status=dead").expect(200);
    expect(dead.body.items).toHaveLength(1);
    expect(dead.body.items[0].attempts).toHaveLength(1); // only the latest attempt in lists
    await owner.post(`/api/deliveries/${dead.body.items[0].id}/retry`).expect(204);
    await owner.post(`/api/deliveries/${dead.body.items[0].id}/retry`).expect(409);
    expect(await drain()).toEqual(["pending"]);
  });

  it("refuses private addresses that aren't allowlisted", async () => {
    const { app, ctx } = testApp({}, { DESTINATION_ALLOW_HOSTS: "" });
    const owner = await loggedIn(app);
    const res = await owner
      .post("/api/destinations")
      .send({ name: "x", url: "http://127.0.0.1:9/hook" })
      .expect(400);
    expect(res.body.error).toMatch(/^That URL can't be used/);
    expect(ctx.env.DESTINATION_ALLOW_HOSTS).toEqual([]);
  });

  it("parks deliveries while a destination is paused and sends them on resume", async () => {
    const { send, drain, owner, dest, hook } = await setup();
    await owner.post(`/api/destinations/${dest.id}/pause`).expect(204);
    await send({}, "d-1").expect(202);
    expect(await drain()).toEqual([]);
    expect(await Delivery.countDocuments({ status: "paused" })).toBe(1);
    await owner.post(`/api/destinations/${dest.id}/resume`).expect(204);
    expect(await drain()).toEqual(["succeeded"]);
    expect(hook.received).toHaveLength(1);
  });

  it("re-delivers when a worker died mid-send and its lease ran out", async () => {
    const { send, ctx, drain, advance } = await setup();
    await send({}).expect(202);
    expect(await claimNext(ctx)).not.toBeNull(); // claimed, then the "worker" crashes
    expect(await drain()).toEqual([]);
    advance(61_000);
    expect(await drain()).toEqual(["succeeded"]);
  });

  it("replays an event to every destination, including ones added later", async () => {
    const { send, drain, owner, source, hook } = await setup();
    const event = (await send({}).expect(202)).body;
    await drain();
    await owner
      .post("/api/destinations")
      .send({ name: "Second", url: hook.url, sourceIds: [source.id] })
      .expect(201);
    const replay = await owner.post(`/api/events/${event.id}/replay`).expect(200);
    expect(replay.body).toEqual({ requeued: 1, created: 1 });
    expect(await drain()).toEqual(["succeeded", "succeeded"]);
    expect(hook.received).toHaveLength(3);
  });

  it("retries every dead delivery of a destination at once", async () => {
    const { send, drain, owner, dest } = await setup([500, 500], { maxAttempts: 1 });
    await send({}, "d-1").expect(202);
    await send({}, "d-2").expect(202);
    expect(await drain()).toEqual(["dead", "dead"]);
    const res = await owner.post(`/api/destinations/${dest.id}/retry-dead`).expect(200);
    expect(res.body).toEqual({ retried: 2 });
    expect(await drain()).toEqual(["succeeded", "succeeded"]);
  });
});

describe("dashboard API", () => {
  it("pages through events newest first with a cursor", async () => {
    const { send, owner } = await setup();
    for (let i = 0; i < 52; i++) await send({ i }, `d-${i}`).expect(202);
    const first = await owner.get("/api/events").expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0]).toMatchObject({ sourceName: "GitHub", deliveries: { pending: 1 } });
    const second = await owner.get(`/api/events?before=${first.body.nextCursor}`).expect(200);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
  });

  it("filters events by source and type", async () => {
    const { send, owner, source } = await setup();
    await send({}, "d-1", "push").expect(202);
    await send({}, "d-2", "issues").expect(202);
    const res = await owner.get(`/api/events?sourceId=${source.id}&eventType=issues`).expect(200);
    expect(res.body.items.map((e: { eventType: string }) => e.eventType)).toEqual(["issues"]);
    expect((await owner.get("/api/events/types").expect(200)).body).toEqual(["issues", "push"]);
  });

  it("reports 24-hour stats", async () => {
    const { send, drain, owner } = await setup([500], { maxAttempts: 1 });
    await send({}, "d-1").expect(202);
    await send({}, "d-2").expect(202);
    await drain();
    const stats = (await owner.get("/api/stats").expect(200)).body;
    expect(stats).toMatchObject({ events24h: 2, succeeded24h: 1, dead24h: 1, pending: 0, successRate: 0.5 });
    expect(stats.hourly).toHaveLength(24);
    expect(stats.hourly.at(-1)).toMatchObject({ events: 2, succeeded: 1, failed: 1 });
  });

  it("sends a test event through a source", async () => {
    const { owner, source, drain, hook } = await setup();
    await owner.post(`/api/sources/${source.id}/test`).expect(201);
    expect(await drain()).toEqual(["succeeded"]);
    expect(JSON.parse(hook.received[0]!.body)).toMatchObject({ type: "hookrelay.test" });
  });

  it("never returns source secrets, and deleting a source removes its data", async () => {
    const { send, owner, source, dest } = await setup();
    await send({}).expect(202);
    const list = await owner.get("/api/sources").expect(200);
    expect(JSON.stringify(list.body)).not.toContain("gh-secret");
    expect(list.body[0]).toMatchObject({ hasSecret: true });
    expect((await Source.findById(source.id).lean())!.secretEnc).not.toContain("gh-secret");
    await owner.del(`/api/sources/${source.id}`).expect(204);
    expect(await Event.countDocuments()).toBe(0);
    expect(await Delivery.countDocuments()).toBe(0);
    expect((await owner.get(`/api/destinations/${dest.id}`).expect(200)).body.sourceIds).toEqual([]);
  });

  it("rotates a destination's signing secret", async () => {
    const { owner, dest } = await setup();
    const before = (await owner.get(`/api/destinations/${dest.id}/secret`)).body.secret;
    const rotated = (await owner.post(`/api/destinations/${dest.id}/rotate-secret`).expect(200)).body.secret;
    expect(rotated).toMatch(/^whsec_/);
    expect(rotated).not.toBe(before);
  });
});
