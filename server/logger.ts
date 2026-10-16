import { pino } from "pino";
import type { Env } from "./env";

export const createLogger = (env: Pick<Env, "LOG_LEVEL">) =>
  pino({
    level: env.LOG_LEVEL,
    redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
  });
