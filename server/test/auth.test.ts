import request from "supertest";
import { describe, expect, it } from "vitest";
import { Session } from "../models";
import { loggedIn, testApp, useDatabase } from "./helpers";

useDatabase();

const csrf = { "x-requested-with": "hookrelay" };

describe("auth", () => {
  it("asks for setup until the first account exists, then only once", async () => {
    const { app } = testApp();
    await request(app).get("/api/auth/state").expect(200, { setupRequired: true, user: null });
    const owner = await loggedIn(app);
    const state = await owner.get("/api/auth/state").expect(200);
    expect(state.body).toMatchObject({ setupRequired: false, user: { email: "owner@example.com" } });
    await request(app)
      .post("/api/auth/setup")
      .set(csrf)
      .send({ email: "intruder@example.com", password: "another long password" })
      .expect(409);
  });

  it("logs in with a case-insensitive email and rejects wrong passwords", async () => {
    const { app } = testApp();
    await loggedIn(app, "Owner@Example.com");
    await request(app)
      .post("/api/auth/login")
      .set(csrf)
      .send({ email: "OWNER@example.com", password: "correct horse battery" })
      .expect(200);
    const wrong = await request(app)
      .post("/api/auth/login")
      .set(csrf)
      .send({ email: "owner@example.com", password: "nope" })
      .expect(401);
    expect(wrong.body.error).toBe("Wrong email or password.");
  });

  it("sets an httpOnly SameSite cookie and stores only a hash of the token", async () => {
    const { app } = testApp();
    const res = await request(app)
      .post("/api/auth/setup")
      .set(csrf)
      .send({ email: "a@example.com", password: "correct horse battery" })
      .expect(201);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/hr_session=[^;]+; Path=\/; Expires=.*HttpOnly; SameSite=Lax/);
    const token = cookie.split(";")[0]!.split("=")[1]!;
    const session = await Session.findOne().lean();
    expect(session!.tokenHash).not.toBe(token);
    expect(session!.tokenHash).toHaveLength(64);
  });

  it("requires a session for the API and the CSRF header for writes", async () => {
    const { app } = testApp();
    await request(app).get("/api/sources").expect(401);
    const owner = await loggedIn(app);
    await owner.agent.post("/api/sources").send({ name: "x", provider: "none" }).expect(403);
  });

  it("rate-limits login attempts per email", async () => {
    const { app } = testApp();
    await loggedIn(app);
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post("/api/auth/login")
        .set(csrf)
        .send({ email: "owner@example.com", password: "bad" })
        .expect(401);
    }
    const blocked = await request(app)
      .post("/api/auth/login")
      .set(csrf)
      .send({ email: "owner@example.com", password: "correct horse battery" })
      .expect(429);
    expect(blocked.body.error).toMatch(/Too many attempts/);
  });

  it("logs out and the old cookie stops working", async () => {
    const { app } = testApp();
    const owner = await loggedIn(app);
    await owner.post("/api/auth/logout").expect(204);
    await owner.get("/api/sources").expect(401);
  });

  it("changes the password and signs out other sessions", async () => {
    const { app } = testApp();
    const owner = await loggedIn(app);
    const other = request.agent(app);
    await other
      .post("/api/auth/login")
      .set(csrf)
      .send({ email: "owner@example.com", password: "correct horse battery" });
    await owner
      .post("/api/auth/password")
      .send({ current: "wrong", next: "a brand new password" })
      .expect(400);
    await owner
      .post("/api/auth/password")
      .send({ current: "correct horse battery", next: "a brand new password" })
      .expect(204);
    await owner.get("/api/sources").expect(200);
    await other.get("/api/sources").expect(401);
  });

  it("manages users but never lets you remove yourself", async () => {
    const { app } = testApp();
    const owner = await loggedIn(app);
    const created = await owner
      .post("/api/users")
      .send({ email: "Teammate@Example.com", password: "teammate password" })
      .expect(201);
    expect(created.body.email).toBe("teammate@example.com");
    await owner
      .post("/api/users")
      .send({ email: "teammate@example.com", password: "teammate password" })
      .expect(409);
    const users = await owner.get("/api/users").expect(200);
    const me = users.body.find((u: { email: string }) => u.email === "owner@example.com");
    await owner.del(`/api/users/${me.id}`).expect(400);
    await owner.del(`/api/users/${created.body.id}`).expect(204);
    await owner.del(`/api/users/not-an-id`).expect(404);
  });
});
