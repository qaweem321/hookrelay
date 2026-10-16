import type { NextFunction, Request, Response } from "express";
import { randomToken, sha256 } from "../lib/crypto";
import { HttpError } from "../lib/http";
import { Session, type UserDoc } from "../models";

export const SESSION_COOKIE = "hr_session";
const SESSION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; email: string };
  }
}

const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/" });

export async function startSession(res: Response, user: Pick<UserDoc, "_id" | "email">, secure: boolean) {
  const token = randomToken("", 32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await Session.create({ tokenHash: sha256(token), userId: user._id, email: user.email, expiresAt });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(secure), expires: expiresAt });
}

export async function endSession(req: Request, res: Response, secure: boolean) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") await Session.deleteOne({ tokenHash: sha256(token) });
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}

// Looks up the session in one query (the email is copied onto it) and slides its expiry at
// most once a day, so most requests don't write.
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  if (session) {
    req.user = { id: String(session.userId), email: session.email };
    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining < (SESSION_DAYS - 1) * DAY_MS) {
      await Session.updateOne(
        { _id: session._id },
        { $set: { expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) } },
      );
    }
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Please log in.");
  next();
}

// CSRF defence for cookie-authenticated writes: browsers won't send a custom header cross-site
// without a CORS preflight, which this API never approves. SameSite=Lax cookies are the second layer.
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "hookrelay")
    throw new HttpError(403, "Missing X-Requested-With header.");
  next();
}
