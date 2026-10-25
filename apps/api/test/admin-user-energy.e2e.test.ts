import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";
import { resetEnergySettings } from "./support/free-models.js";
import { type TestUser, userWithSession } from "./support/users.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("admin energy of users", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let member: TestUser;

  const send = (method: "get" | "put" | "post", path: string, body?: object, as = admin) => {
    const req = request(app.getHttpServer())[method](`/admin/energy/users${path}`).set("Origin", WEB_ORIGIN).set("Cookie", as.cookie);
    return body ? req.send(body) : req;
  };
  const balanceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).energy;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.appEvent.deleteMany();
    await resetEnergySettings(prisma);
    admin = await userWithSession(app, 1, { role: "admin" });
    member = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("a user who is not an admin gets 403 from each endpoint", async () => {
    await send("get", "", undefined, member).expect(403);
    await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: 10 }, member).expect(403);
    await send("put", `/${member.user.id}/daily`, { dailyEnergy: 50 }, member).expect(403);
    await send("get", `/${member.user.id}/history`, undefined, member).expect(403);
  });

  it("lists the users with the balance that they have now, and finds a user by handle", async () => {
    const res = await send("get", "").expect(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users.find((user: { id: string }) => user.id === member.user.id)).toEqual({
      id: member.user.id,
      name: "User 2",
      handle: "user_2",
      email: "user2@example.com",
      role: "user",
      balance: 20,
      dailyEnergy: 20,
      ownDailyEnergy: null,
    });

    const found = await send("get", "?q=USER_2").expect(200);
    expect(found.body.users.map((user: { id: string }) => user.id)).toEqual([member.user.id]);
  });

  it("pages the list with 10 users on each page, and gives the page count and the total", async () => {
    for (let n = 3; n <= 25; n++) {
      await userWithSession(app, n);
    }
    const first = await send("get", "").expect(200);
    expect(first.body).toMatchObject({ page: 1, pageCount: 3, total: 25 });
    expect(first.body.users).toHaveLength(10);
    const last = await send("get", "?page=3").expect(200);
    expect(last.body.users).toHaveLength(5);
    expect(new Set([...first.body.users, ...last.body.users].map((user: { id: string }) => user.id)).size).toBe(15);
    expect((await send("get", "?page=4").expect(200)).body).toMatchObject({ users: [], page: 4, pageCount: 3 });
    await send("get", "?page=0").expect(400);
  });

  it("an add of 10 puts energy on top of today's balance, saves a ledger row and an audit event", async () => {
    const res = await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: 10 }).expect(200);

    expect(res.body).toMatchObject({ id: member.user.id, balance: 30 });
    expect(await balanceOf(member.user.id)).toBe(3000);
    expect(await prisma.energyEntry.findMany({ where: { userId: member.user.id, reason: "admin" } })).toMatchObject([{ amount: 1000 }]);
    expect(await prisma.appEvent.findMany({ where: { type: "admin_change" } })).toMatchObject([
      {
        userId: admin.user.id,
        reason: "user_energy",
        details: { userId: member.user.id, old: { balance: 20 }, new: { balance: 30 } },
      },
    ]);
  });

  it("a set gives an exact balance, and a take-away below 0 or a value with 3 decimal places is refused", async () => {
    expect((await send("post", `/${member.user.id}/adjust`, { mode: "set", amount: 5.5 }).expect(200)).body).toMatchObject({ balance: 5.5 });
    expect((await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: -6 }).expect(400)).body).toEqual({
      error: "energy_below_zero",
    });
    await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: 0.555 }).expect(400);
    await send("post", `/${member.user.id}/adjust`, { mode: "set", amount: -1 }).expect(400);
    expect((await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: -5.5 }).expect(200)).body).toMatchObject({ balance: 0 });
  });

  it("an own daily amount replaces the global amount at the next refill, and an empty value uses the global amount again", async () => {
    const res = await send("put", `/${member.user.id}/daily`, { dailyEnergy: 50 }).expect(200);
    expect(res.body).toMatchObject({ dailyEnergy: 50, ownDailyEnergy: 50 });
    expect(await prisma.appEvent.findMany({ where: { type: "admin_change" } })).toMatchObject([
      { reason: "user_energy", details: { userId: member.user.id, old: { dailyEnergy: null }, new: { dailyEnergy: 50 } } },
    ]);

    await prisma.user.update({ where: { id: member.user.id }, data: { energyRefilledAt: new Date(Date.now() - DAY_MS) } });
    expect((await send("get", "?q=user_2").expect(200)).body.users[0]).toMatchObject({ balance: 50, dailyEnergy: 50 });

    expect((await send("put", `/${member.user.id}/daily`, { dailyEnergy: null }).expect(200)).body).toMatchObject({
      dailyEnergy: 20,
      ownDailyEnergy: null,
    });
  });

  it("the history shows the changes of the balance, the newest first", async () => {
    await send("post", `/${member.user.id}/adjust`, { mode: "add", amount: 10 }).expect(200);

    const res = await send("get", `/${member.user.id}/history`).expect(200);

    expect(res.body.map((entry: { reason: string; amount: number }) => [entry.reason, entry.amount])).toEqual([
      ["admin", 10],
      ["refill", 20],
    ]);
  });

  it("the history keeps the save order of rows with the same time", async () => {
    const at = new Date();
    await prisma.energyEntry.create({
      data: { id: "ffffffff-ffff-4fff-bfff-ffffffffffff", userId: member.user.id, amount: 2000, reason: "refill", createdAt: at },
    });
    await prisma.energyEntry.create({
      data: { id: "00000000-0000-4000-8000-000000000000", userId: member.user.id, amount: 1000, reason: "admin", createdAt: at },
    });

    const res = await send("get", `/${member.user.id}/history`).expect(200);

    expect(res.body.map((entry: { reason: string }) => entry.reason)).toEqual(["admin", "refill"]);
  });

  it("an unknown user gives 404", async () => {
    await send("post", "/00000000-0000-4000-8000-000000000999/adjust", { mode: "add", amount: 1 }).expect(404);
    await send("post", "/not-a-uuid/adjust", { mode: "add", amount: 1 }).expect(404);
  });
});
