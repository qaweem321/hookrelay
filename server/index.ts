import path from "node:path";
import { createApp } from "./app";
import { createContext } from "./context";
import { connectDb, disconnectDb } from "./db";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { startWorker, type WorkerHandle } from "./services/worker";

const env = loadEnv();
const logger = createLogger(env);
const ctx = createContext(env);
await connectDb(env.MONGO_URL);

// The built dashboard, relative to where the app is started (the project root, or /app in Docker).
const app = createApp(ctx, logger, { webDist: path.resolve("web/dist") });
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "Hookrelay is listening"));
const worker: WorkerHandle | null = env.RUN_WORKER ? startWorker(ctx, logger) : null;

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  await worker?.stop();
  await disconnectDb();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
