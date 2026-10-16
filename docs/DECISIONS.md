# Design decisions

Why Hookrelay is built the way it is, and what each choice costs. Each section answers a question an
interviewer or contributor is likely to ask.

## 1. Why answer the sender right away and deliver later?

Providers give a webhook a few seconds before they count it as failed and retry, and some disable
endpoints that fail often. Hookrelay verifies the signature, saves the event, creates its deliveries
and answers `202` in a few milliseconds. Sending to your services happens in the worker, where a slow
or broken destination can't make the provider time out.

**Trade-off:** delivery is asynchronous. If your service needs the event within milliseconds,
receive it directly instead.

## 2. Why MongoDB?

Webhook bodies are arbitrary JSON (or not JSON at all) with different headers per provider. A
document store keeps each event as received, as raw bytes plus headers, without a schema per
provider. The queue needs only single-document atomic updates, which MongoDB has, so there's no
second system (Redis, RabbitMQ) to run.

**Trade-off:** no multi-document transactions are used, so the code has to stay correct between
writes. Sections 4 and 5 show how.

## 3. How do several workers avoid sending the same delivery twice?

`claimNext` is one `findOneAndUpdate`: find a due delivery (`pending` and `nextAttemptAt <= now`)
and set it to `delivering` with a lease (`lockedUntil`) in the same atomic operation. Two workers
can't both get it. If a worker dies mid-send, the lease runs out and another worker claims the
delivery again. Run as many workers as you like.

The final update after sending only applies while the worker still holds that lease
(`{ _id, status: "delivering", lockedUntil }`), so a manual retry clicked in the meantime isn't
overwritten.

**Trade-off:** delivery is _at least once_. A worker that dies after the destination answered but
before saving the result sends again later. That is why every delivery carries a stable
`webhook-id`: receivers should ignore ids they have already processed (the example receiver does).
Order isn't guaranteed either; retries mean a later event can arrive first.

## 4. What happens if the process dies between saving an event and creating its deliveries?

The event is saved with `fanoutPending: true`, and only set to `false` after its deliveries exist.
The worker sweeps for events still pending after 30 seconds and runs fan-out again. A unique index
on `(eventId, destinationId)` makes fan-out idempotent, so running it twice never creates duplicates.

## 5. How are provider retries deduplicated?

Each provider has its own event ID: `X-GitHub-Delivery`, Stripe's `id`, Standard Webhooks'
`webhook-id`, or `Idempotency-Key` for custom senders. It is stored as `dedupeKey` with a unique
partial index on `(sourceId, dedupeKey)`. A second copy hits the index, and Hookrelay answers `200`
with the original event's id, so the provider stops retrying and nothing is delivered twice.
Checking with a query first would race; letting the index decide doesn't.

## 6. How are retries scheduled?

Up to 8 attempts by default (configurable from 1 to 12): 10 s, 1 min, 5 min, 30 min, 2 h, 6 h,
12 h, about a day in total, each with ±20% jitter so a destination that comes back isn't hit by its
whole backlog at once. A `Retry-After` header is honoured (capped at 6 hours). After the last
attempt the delivery is marked failed, shown on the dashboard, and can be retried one by one or all
at once per destination after fixing the endpoint.

## 7. How are signatures checked and created?

**Incoming**, per source: GitHub (`X-Hub-Signature-256`), Stripe (`Stripe-Signature` with a
5-minute timestamp tolerance against replays), Standard Webhooks (used by Svix, Clerk, Resend and
others) or a custom HMAC-SHA256 header. All comparisons are constant-time. The raw body bytes are
kept for this: re-serialized JSON would not match the signature.

**Outgoing**, every delivery is signed per the [Standard Webhooks](https://www.standardwebhooks.com)
spec, so receivers can verify it with an existing library in most languages. A unit test checks the
implementation against the spec's published example.

## 8. How are secrets stored?

Source and destination signing secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before
they are written, so a leaked database dump doesn't let anyone forge webhooks. Source secrets are
never returned by the API; destination secrets only through an explicit "Reveal".

Passwords use scrypt from Node's standard library. Sessions are random tokens in an `httpOnly`,
`SameSite=Lax` cookie, and the database stores only their SHA-256 hash.

## 9. How is the dashboard protected against CSRF?

Every write must carry `X-Requested-With: hookrelay`. Browsers can't add a custom header to a
cross-site request without a CORS preflight, and the API never approves one. The `SameSite=Lax`
cookie is a second layer.

## 10. Can a destination be used to reach internal services (SSRF)?

No, unless you allow it. Destination URLs are checked when saved and again on every send with
[`@qaweem321/no-ssrf`](https://github.com/qaweem321/no-ssrf): private, loopback, link-local
(cloud metadata) and other reserved addresses are refused, including names that resolve to them
and redirects. `DESTINATION_ALLOW_HOSTS` lists the hosts you trust, such as `receiver` in Docker
Compose.

## 11. How does the data not grow forever?

Events and deliveries get an `expiresAt` date (`RETENTION_DAYS`, 14 by default) and a TTL index
deletes them. Storing the date on each document, instead of a fixed TTL on the index, means a
changed retention setting applies to new events without rebuilding the index. A delivery keeps at
most its last 50 attempts.

## 12. Why cursor pagination?

Lists page by `_id` (`?before=<id>`), newest first. That's an index seek however deep you go, and
pages don't shift when new events arrive, unlike `skip`/`limit`. Delivery counts and source names
for a page come from two queries run in parallel, never one query per row.

## 13. Why one image for the API, the worker and the seed script?

They share all their code. The command decides the role (`dist/server/index.js`,
`dist/server/worker.js`, `dist/scripts/seed.js`). For small installs, `RUN_WORKER=true` runs the
worker inside the API process.
