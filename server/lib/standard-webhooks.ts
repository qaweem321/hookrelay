import { createHmac, randomBytes } from "node:crypto";

// Signing per the Standard Webhooks spec (https://www.standardwebhooks.com), also used by Svix:
// HMAC-SHA256 over "<id>.<timestamp>.<body>", sent as "v1,<base64>". Receivers can verify with
// any Standard Webhooks library.

export function newSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

export function secretKey(secret: string): Buffer {
  return secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
}

export function signature(secret: string, id: string, timestamp: number, body: Buffer | string): string {
  const mac = createHmac("sha256", secretKey(secret))
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest("base64");
  return `v1,${mac}`;
}
