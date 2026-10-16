import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { credentials, newAccount, passwordChange } from "../../shared/schemas";
import type { AuthState } from "../../shared/types";
import type { Context } from "../context";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { HttpError } from "../lib/http";
import { endSession, requireUser, startSession } from "../middleware/auth";
import { Marker, Session, User } from "../models";

// Compared against when the email doesn't exist, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = await hashPassword("not-a-real-password");

export function authRoutes(ctx: Context) {
  const router = Router();
  const secure = ctx.env.APP_URL.startsWith("https://");
  const limits = { windowMs: 15 * 60 * 1000, standardHeaders: "draft-8" as const, legacyHeaders: false };
  const message = { error: "Too many attempts. Wait 15 minutes and try again." };
  const perIp = rateLimit({ ...limits, limit: 30, message });
  const perEmail = rateLimit({
    ...limits,
    limit: 10,
    message,
    keyGenerator: (req) =>
      `email:${String(req.body?.email ?? "")
        .trim()
        .toLowerCase()}`,
  });

  router.get("/state", async (req, res) => {
    const setupDone = await Marker.exists({ _id: "setup" });
    const state: AuthState = { setupRequired: !setupDone, user: req.user ?? null };
    res.json(state);
  });

  // Creates the first account. Only works once: the "setup" marker can be inserted a single time.
  router.post("/setup", perIp, async (req, res) => {
    const input = newAccount.parse(req.body);
    try {
      await Marker.create({ _id: "setup" });
    } catch {
      throw new HttpError(409, "Setup is already done. Log in instead.");
    }
    const user = await User.create({ email: input.email, passwordHash: await hashPassword(input.password) });
    await startSession(res, user, secure);
    res.status(201).json({ user: { id: String(user._id), email: user.email } });
  });

  router.post("/login", perIp, perEmail, async (req, res) => {
    const input = credentials.parse(req.body);
    const user = await User.findOne({ email: input.email }).lean();
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, "Wrong email or password.");
    await startSession(res, user, secure);
    res.json({ user: { id: String(user._id), email: user.email } });
  });

  router.post("/logout", async (req, res) => {
    await endSession(req, res, secure);
    res.status(204).end();
  });

  // Changing the password signs out every other session.
  router.post("/password", requireUser, perIp, async (req, res) => {
    const input = passwordChange.parse(req.body);
    const user = await User.findById(req.user!.id);
    if (!user || !(await verifyPassword(input.current, user.passwordHash))) {
      throw new HttpError(400, "Your current password is wrong.");
    }
    user.passwordHash = await hashPassword(input.next);
    await Promise.all([user.save(), Session.deleteMany({ userId: user._id })]);
    await startSession(res, user, secure);
    res.status(204).end();
  });

  return router;
}
