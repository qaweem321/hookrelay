import { createContext } from "../server/context";
import { connectDb, disconnectDb } from "../server/db";
import { loadEnv } from "../server/env";
import { encryptSecret, hashPassword, randomToken } from "../server/lib/crypto";
import { newSigningSecret } from "../server/lib/standard-webhooks";
import { Destination, Marker, Source, User } from "../server/models";
import { receive } from "../server/services/ingest";

// Demo data for local runs. Safe to run repeatedly: it only adds what's missing.
//   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD  first account (skipped once setup is done)
//   SEED_RECEIVER_URL                       where the demo destination points
//   SEED_DESTINATION_SECRET                 its signing secret, shared with examples/receiver.mjs
const env = loadEnv();
const ctx = createContext(env);
await connectDb(env.MONGO_URL);

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (email && password && !(await Marker.exists({ _id: "setup" }))) {
  await Marker.create({ _id: "setup" });
  await User.create({ email, passwordHash: await hashPassword(password) });
  console.log(`Created account ${email}`);
}

if ((await Source.countDocuments()) === 0) {
  const source = await Source.create({ name: "Demo shop", provider: "none", slug: randomToken("src_", 18) });
  const receiverUrl = process.env.SEED_RECEIVER_URL;
  if (receiverUrl) {
    await Destination.create({
      name: "Demo receiver",
      url: receiverUrl,
      sourceIds: [source._id],
      secretEnc: encryptSecret(process.env.SEED_DESTINATION_SECRET || newSigningSecret(), ctx.key),
    });
  }
  const types = ["order.created", "order.paid", "order.shipped", "customer.updated"];
  for (let i = 0; i < 12; i++) {
    const type = types[i % types.length]!;
    const body = Buffer.from(
      JSON.stringify({ id: `evt_demo_${i}`, type, data: { orderId: 1000 + i, amount: 1999 + i * 100 } }),
    );
    await receive(
      ctx,
      source.toObject(),
      { "content-type": "application/json", "idempotency-key": `evt_demo_${i}` },
      body,
      {
        skipVerification: true,
      },
    );
  }
  console.log("Created the demo source, destination and 12 events");
}

await disconnectDb();
