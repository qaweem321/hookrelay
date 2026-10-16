import { Router } from "express";
import { mongo } from "mongoose";
import { newAccount } from "../../shared/schemas";
import { hashPassword } from "../lib/crypto";
import { HttpError, notFound, objectId } from "../lib/http";
import { Session, User } from "../models";
import { toUser } from "../services/serialize";

export function userRoutes() {
  const router = Router();

  router.get("/", async (_req, res) => {
    const users = await User.find({}, { email: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean();
    res.json(users.map(toUser));
  });

  router.post("/", async (req, res) => {
    const input = newAccount.parse(req.body);
    try {
      const user = await User.create({
        email: input.email,
        passwordHash: await hashPassword(input.password),
      });
      res.status(201).json(toUser(user));
    } catch (error) {
      if (error instanceof mongo.MongoServerError && error.code === 11000) {
        throw new HttpError(409, "Someone with that email already has an account.");
      }
      throw error;
    }
  });

  router.delete("/:id", async (req, res) => {
    const id = objectId(req.params.id, "User not found");
    if (String(id) === req.user!.id) throw new HttpError(400, "You can't remove your own account.");
    const [deleted] = await Promise.all([User.deleteOne({ _id: id }), Session.deleteMany({ userId: id })]);
    if (deleted.deletedCount === 0) throw notFound("User not found");
    res.status(204).end();
  });

  return router;
}
