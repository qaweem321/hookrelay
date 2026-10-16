import { safeRequest } from "@qaweem321/no-ssrf/node";
import type { Env } from "./env";

export type Requester = typeof safeRequest;

// Everything the routes, services and worker need from the outside world, in one place,
// so tests can swap the clock or the HTTP client.
export type Context = {
  env: Env;
  key: Buffer;
  request: Requester;
  now: () => Date;
};

export function createContext(env: Env, overrides: Partial<Omit<Context, "env" | "key">> = {}): Context {
  return {
    env,
    key: Buffer.from(env.ENCRYPTION_KEY, "hex"),
    request: safeRequest,
    now: () => new Date(),
    ...overrides,
  };
}

export const expiresAt = (ctx: Context, from = ctx.now()) =>
  new Date(from.getTime() + ctx.env.RETENTION_DAYS * 24 * 60 * 60 * 1000);
