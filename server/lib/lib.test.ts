import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../env";
import { parseRetryAfter, retryDelayMs } from "./backoff";
import { decryptSecret, encryptSecret, hashPassword, safeEqual, verifyPassword } from "./crypto";
import { matchesEventType } from "./filter";
import { extractMeta, verifyInbound, type InboundConfig } from "./inbound";
import { newSigningSecret, signature } from "./standard-webhooks";

const body = Buffer.from(JSON.stringify({ id: "evt_1", type: "invoice.paid" }));
const now = Date.UTC(2026, 9, 16, 12, 0, 0);
const seconds = Math.floor(now / 1000);
const hmac = { header: "x-signature", encoding: "hex" as const, prefix: "" };
const config = (provider: InboundConfig["provider"], secret: string | null = "s3cret"): InboundConfig => ({
  provider,
  secret,
  hmac,
});

describe("verifyInbound", () => {
  it("accepts anything when the source has no signature check", () => {
    expect(verifyInbound(config("none", null), {}, body)).toEqual({ ok: true });
  });

  it("rejects signed providers without a secret", () => {
    expect(verifyInbound(config("github", null), {}, body).ok).toBe(false);
  });

  it("verifies GitHub signatures", () => {
    const good = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(verifyInbound(config("github"), { "x-hub-signature-256": good }, body).ok).toBe(true);
    expect(
      verifyInbound(config("github"), { "x-hub-signature-256": good.replace(/.$/, "0") }, body),
    ).toMatchObject({
      ok: false,
    });
    expect(verifyInbound(config("github"), {}, body)).toEqual({
      ok: false,
      reason: "missing X-Hub-Signature-256 header",
    });
  });

  it("verifies Stripe signatures, including rotated secrets and the timestamp tolerance", () => {
    const sig = createHmac("sha256", "s3cret").update(`${seconds}.`).update(body).digest("hex");
    const header = `t=${seconds},v1=deadbeef,v1=${sig}`;
    expect(verifyInbound(config("stripe"), { "stripe-signature": header }, body, now).ok).toBe(true);
    expect(verifyInbound(config("stripe"), { "stripe-signature": header }, body, now + 301_000)).toEqual({
      ok: false,
      reason: "timestamp outside the 5-minute tolerance",
    });
    expect(verifyInbound(config("stripe"), { "stripe-signature": header }, Buffer.from("{}"), now).ok).toBe(
      false,
    );
  });

  it("verifies Standard Webhooks signatures", () => {
    const secret = newSigningSecret();
    const headers = {
      "webhook-id": "msg_1",
      "webhook-timestamp": String(seconds),
      "webhook-signature": `v1,bogus ${signature(secret, "msg_1", seconds, body)}`,
    };
    expect(verifyInbound(config("standard", secret), headers, body, now).ok).toBe(true);
    expect(
      verifyInbound(config("standard", secret), { ...headers, "webhook-id": "msg_2" }, body, now).ok,
    ).toBe(false);
  });

  it("verifies custom HMAC headers with prefix and base64", () => {
    const cfg: InboundConfig = {
      provider: "hmac",
      secret: "k",
      hmac: { header: "X-Sig", encoding: "base64", prefix: "sha256=" },
    };
    const good = `sha256=${createHmac("sha256", "k").update(body).digest("base64")}`;
    expect(verifyInbound(cfg, { "x-sig": good }, body).ok).toBe(true);
    expect(verifyInbound(cfg, { "x-sig": good.slice(7) }, body).ok).toBe(false);
  });
});

describe("extractMeta", () => {
  it("reads provider event IDs and types", () => {
    expect(extractMeta("github", { "x-github-delivery": "d1", "x-github-event": "push" }, body)).toEqual({
      dedupeKey: "d1",
      eventType: "push",
    });
    expect(extractMeta("stripe", {}, body)).toEqual({ dedupeKey: "evt_1", eventType: "invoice.paid" });
    expect(extractMeta("standard", { "webhook-id": "msg_9" }, body)).toEqual({
      dedupeKey: "msg_9",
      eventType: "invoice.paid",
    });
    expect(extractMeta("none", { "idempotency-key": "k1" }, Buffer.from("not json"))).toEqual({
      dedupeKey: "k1",
      eventType: null,
    });
  });
});

describe("standard webhooks signing", () => {
  it("matches the spec's published example", () => {
    // Example from the Standard Webhooks specification.
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const payload = '{"test": 2432232314}';
    expect(signature(secret, "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, payload)).toBe(
      "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
    );
  });
});

describe("retries", () => {
  it("backs off on a schedule with jitter", () => {
    expect(retryDelayMs(1, () => 0.5)).toBe(10_000);
    expect(retryDelayMs(2, () => 0)).toBe(48_000);
    expect(retryDelayMs(99, () => 1)).toBe(43_200_000 * 1.2);
  });

  it("honours Retry-After, capped at 6 hours", () => {
    expect(retryDelayMs(1, () => 0.5, 120_000)).toBe(120_000);
    expect(retryDelayMs(1, () => 0.5, 10 * 3_600_000)).toBe(6 * 3_600_000);
    expect(parseRetryAfter("30")).toBe(30_000);
    expect(parseRetryAfter(new Date(now + 5_000).toUTCString(), now)).toBe(5_000);
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("event type filters", () => {
  it("supports exact names, prefixes and *", () => {
    expect(matchesEventType([], null)).toBe(true);
    expect(matchesEventType(["invoice.*"], "invoice.paid")).toBe(true);
    expect(matchesEventType(["invoice.*"], "invoices.paid")).toBe(false);
    expect(matchesEventType(["push"], "push")).toBe(true);
    expect(matchesEventType(["push"], null)).toBe(false);
    expect(matchesEventType(["*"], null)).toBe(true);
  });
});

describe("crypto", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(await verifyPassword("hunter2hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("encrypts secrets so they round-trip but can't be tampered with", () => {
    const key = Buffer.alloc(32, 7);
    const sealed = encryptSecret("whsec_abc", key);
    expect(sealed).not.toContain("whsec_abc");
    expect(decryptSecret(sealed, key)).toBe("whsec_abc");
    expect(() => decryptSecret(sealed.slice(0, -2) + "AA", key)).toThrow();
  });

  it("compares strings in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("loadEnv", () => {
  it("lists every problem at once", () => {
    expect(() => loadEnv({ MONGO_URL: "postgres://x", ENCRYPTION_KEY: "short" })).toThrow(
      /MONGO_URL: must start with mongodb[\s\S]*ENCRYPTION_KEY: must be 64 hex/,
    );
  });

  it("parses flags and lists", () => {
    const env = loadEnv({
      MONGO_URL: "mongodb://localhost/x",
      ENCRYPTION_KEY: "b".repeat(64),
      RUN_WORKER: "true",
      DESTINATION_ALLOW_HOSTS: " receiver , localhost,",
    });
    expect(env.RUN_WORKER).toBe(true);
    expect(env.ALLOW_HTTP_DESTINATIONS).toBe(false);
    expect(env.DESTINATION_ALLOW_HOSTS).toEqual(["receiver", "localhost"]);
  });
});
