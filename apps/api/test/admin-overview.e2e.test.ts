import type { NestExpressApplication } from "@nestjs/platform-express";
import type { OverviewStats } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { createCharacter } from "./support/characters.js";
import { startChat } from "./support/chat-stream.js";
import { type TestUser, userWithSession } from "./support/users.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date of the time in UTC, such as 2026-10-25. */
const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

describe("admin overview", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let member: TestUser;

  const get = (path: string, cookie = admin.cookie) => request(app.getHttpServer()).get(path).set("Cookie", cookie);
  const stats = async (query: string) => (await get(`/admin/overview/stats?${query}`).expect(200)).body as OverviewStats;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.appEvent.deleteMany();
    await prisma.user.deleteMany();
    admin = await userWithSession(app, 1, { role: "admin" });
    member = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("stats", () => {
    it("gives 403 to a normal user and 401 to a visitor", async () => {
      expect((await get("/admin/overview/stats", member.cookie).expect(403)).body).toEqual({ error: "forbidden" });
      await get("/admin/overview/stats", "").expect(401);
    });

    it("counts the rows of today and gives 0 for an empty day", async () => {
      const now = Date.now();
      await prisma.user.update({ where: { id: member.user.id }, data: { createdAt: new Date(now - 3 * DAY_MS) } });
      const chatId = await startChat(app, member, await createCharacter(app, member.cookie));
      await prisma.message.createMany({
        data: [
          { chatId, role: "user", content: "Hi", position: 1 },
          { chatId, role: "user", content: "Again", position: 2 },
        ],
      });
      await prisma.appEvent.createMany({
        data: [{ type: "ai_reply_failed" }, { type: "ai_reply_failed" }, { type: "proxy_test_failed" }, { type: "login" }],
      });

      const body = await stats("period=7d&tz=UTC");

      expect(body.days).toHaveLength(7);
      expect(body.days.at(-1)).toBe(utcDay(now));
      expect(body.days[0]).toBe(utcDay(now - 6 * DAY_MS));
      expect(body.metrics.newUsers).toEqual({ total: 2, series: [0, 0, 0, 1, 0, 0, 1] });
      expect(body.metrics.activeUsers).toEqual({ total: 1, series: [0, 0, 0, 0, 0, 0, 1] });
      expect(body.metrics.newChats.total).toBe(1);
      expect(body.metrics.newMessages.total).toBe(2);
      expect(body.metrics.newCharacters.total).toBe(1);
      expect(body.metrics.failedReplies).toEqual({ total: 2, series: [0, 0, 0, 0, 0, 0, 2] });
      expect(body.metrics.failedProxyTests.total).toBe(1);
      expect(body.metrics.logins.total).toBe(1);
      expect(body.metrics.failedChoices).toEqual({ total: 0, series: [0, 0, 0, 0, 0, 0, 0] });
    });

    it("today has one day, and the period starts at midnight in UTC", async () => {
      await prisma.user.update({ where: { id: member.user.id }, data: { createdAt: new Date(Date.now() - DAY_MS) } });
      const body = await stats("period=today&tz=UTC");
      expect(body.days).toEqual([utcDay(Date.now())]);
      expect(body.metrics.newUsers).toEqual({ total: 1, series: [1] });
    });

    it("groups by the day of the tz", async () => {
      // Asia/Manila is UTC+8 and has no daylight saving time.
      const manilaToday = utcDay(Date.now() + 8 * 60 * 60 * 1000);
      const midnight = Date.parse(`${manilaToday}T00:00:00+08:00`);
      await prisma.appEvent.createMany({
        data: [
          { type: "login", createdAt: new Date(midnight + 1000) },
          { type: "login", createdAt: new Date(midnight - 1000) },
        ],
      });

      const body = await stats("period=7d&tz=Asia/Manila");

      expect(body.days.at(-1)).toBe(manilaToday);
      expect(body.metrics.logins.series.slice(-2)).toEqual([1, 1]);
    });

    it("gives 400 invalid_period for a bad tz or period", async () => {
      expect((await get("/admin/overview/stats?period=year").expect(400)).body).toEqual({ error: "invalid_period" });
      await get("/admin/overview/stats?tz=Mars/Base").expect(400);
      await get("/admin/overview/stats?tz=UTC';--").expect(400);
    });
  });
});
