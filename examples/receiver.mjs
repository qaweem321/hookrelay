// A tiny webhook receiver that verifies Hookrelay's Standard Webhooks signature.
// Copy it into your own service, or run it to try Hookrelay locally:
//   HOOKRELAY_SECRET=whsec_... FAIL_RATE=0.2 node examples/receiver.mjs
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);
const secret = process.env.HOOKRELAY_SECRET ?? "";
// Answer this share of requests with a 500, to watch Hookrelay retry.
const failRate = Number(process.env.FAIL_RATE ?? 0);
const seen = new Set(); // webhook-ids already processed: retries and replays arrive with the same id

function verify(headers, body) {
  const id = headers["webhook-id"];
  const timestamp = Number(headers["webhook-timestamp"]);
  const signatures = String(headers["webhook-signature"] ?? "").split(" ");
  if (!id || !timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(
    `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64")}`,
  );
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
}

createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const id = req.headers["webhook-id"];
    if (secret && !verify(req.headers, body)) {
      console.log(`✗ ${id}: bad signature`);
      res.writeHead(401).end("bad signature");
      return;
    }
    if (Math.random() < failRate) {
      console.log(`… ${id}: pretending to be down (attempt ${req.headers["x-hookrelay-attempt"]})`);
      res.writeHead(500).end("temporarily unavailable");
      return;
    }
    const duplicate = seen.has(id);
    seen.add(id);
    console.log(
      `✓ ${id}: ${req.headers["x-hookrelay-event-type"] ?? "event"}${duplicate ? " (duplicate, ignored)" : ""}`,
    );
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ received: true, duplicate }));
  });
}).listen(port, () => console.log(`Receiver listening on http://localhost:${port}`));
