import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((value) => value === "true" || value === "1");

const list = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3500),
  MONGO_URL: z.string().regex(/^mongodb(\+srv)?:\/\//, "must start with mongodb:// or mongodb+srv://"),
  APP_URL: z.url().default("http://localhost:3500"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (openssl rand -hex 32)"),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  MAX_PAYLOAD_BYTES: z.coerce.number().int().min(1024).max(10_000_000).default(1_000_000),
  RUN_WORKER: flag,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  DESTINATION_ALLOW_HOSTS: list,
  ALLOW_HTTP_DESTINATIONS: flag,
  TRUST_PROXY: flag,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema>;

// Fails fast at startup with every problem listed, instead of crashing later on first use.
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}`);
  }
  return result.data;
}
