import { createContext } from "./context";
import { connectDb, disconnectDb } from "./db";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { startWorker } from "./services/worker";

// Standalone delivery worker. Run as many as you like: claims are atomic.
const env = loadEnv();
const logger = createLogger(env);
await connectDb(env.MONGO_URL);
const worker = startWorker(createContext(env), logger);

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down, finishing in-flight deliveries");
  await worker.stop();
  await disconnectDb();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
