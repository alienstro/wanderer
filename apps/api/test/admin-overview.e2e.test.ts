import type { NestExpressApplication } from "@nestjs/platform-express";
import type { OverviewHealth, OverviewProblemList, OverviewStats, TopCharacterList } from "@wanderer/shared";
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
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

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

  it("each panel endpoint gives 403 to a normal user and 401 to a visitor", async () => {
    for (const path of ["/admin/overview/problems", "/admin/overview/top-characters", "/admin/overview/health"]) {
      await get(path, member.cookie).expect(403);
      await get(path, "").expect(401);
    }
  });

  describe("problems", () => {
    it("lists problems newest first with no login rows", async () => {
      const characterId = await createCharacter(app, member.cookie, { title: "Mira" });
      await prisma.appEvent.createMany({
        data: [
          { type: "login", userId: member.user.id, createdAt: minutesAgo(1) },
          { type: "ai_reply_failed", userId: member.user.id, reason: "timeout", createdAt: minutesAgo(30) },
          { type: "choices_failed", userId: member.user.id, characterId, reason: "invalid_key", createdAt: minutesAgo(5) },
          { type: "proxy_test_failed", reason: "invalid_key", createdAt: new Date(Date.now() - 40 * DAY_MS) },
        ],
      });

      const body = (await get("/admin/overview/problems?period=30d").expect(200)).body as OverviewProblemList;

      expect(body.problems.map((problem) => problem.type)).toEqual(["choices_failed", "ai_reply_failed"]);
      expect(body.problems[0]).toMatchObject({
        reason: "invalid_key",
        user: { id: member.user.id, handle: "user_2" },
        character: { id: characterId, title: "Mira" },
      });
      expect(body.problems[1]?.character).toBeNull();
    });

    it("pages the problems 20 at a time, newest first, with no row two times", async () => {
      const tie = minutesAgo(30);
      // Rows 19 to 21 of the list have the same time, so the ID must break the tie at the page edge.
      const createdAt = (index: number) => (index >= 18 && index <= 20 ? tie : minutesAgo(index < 18 ? index + 1 : index + 20));
      await prisma.appEvent.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({ type: "ai_reply_failed" as const, reason: "timeout", createdAt: createdAt(index) })),
      });

      const first = (await get("/admin/overview/problems?period=7d").expect(200)).body as OverviewProblemList;
      expect(first.problems).toHaveLength(20);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = (
        await get(`/admin/overview/problems?period=7d&cursor=${encodeURIComponent(first.nextCursor ?? "")}`).expect(200)
      ).body as OverviewProblemList;
      expect(second.problems).toHaveLength(5);
      expect(second.nextCursor).toBeNull();

      const all = [...first.problems, ...second.problems];
      expect(new Set(all.map((problem) => problem.id)).size).toBe(25);
      const times = all.map((problem) => Date.parse(problem.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it("gives 400 invalid_cursor for a bad cursor", async () => {
      expect((await get("/admin/overview/problems?cursor=abc").expect(400)).body).toEqual({ error: "invalid_cursor" });
    });

    it("a problem of a deleted user has user null", async () => {
      await prisma.appEvent.create({ data: { type: "summary_failed", userId: member.user.id, reason: "timeout" } });
      await prisma.user.delete({ where: { id: member.user.id } });
      const body = (await get("/admin/overview/problems").expect(200)).body as OverviewProblemList;
      expect(body.problems).toHaveLength(1);
      expect(body.problems[0]?.user).toBeNull();
    });
  });

  it("orders the top characters by chats and by likes in the period", async () => {
    const mira = await createCharacter(app, member.cookie, { title: "Mira" });
    const onnit = await createCharacter(app, member.cookie, { title: "Onnit" });
    const chat = (characterId: string, createdAt = new Date()) =>
      prisma.chat.create({ data: { userId: member.user.id, characterId, title: "Chat", createdAt } });
    await chat(mira);
    await chat(onnit);
    await chat(onnit);
    await chat(mira, new Date(Date.now() - 10 * DAY_MS));
    await prisma.characterLike.create({ data: { userId: admin.user.id, characterId: mira } });

    const body = (await get("/admin/overview/top-characters?period=7d").expect(200)).body as TopCharacterList;

    expect(body.byChats).toEqual([
      { id: onnit, title: "Onnit", count: 2 },
      { id: mira, title: "Mira", count: 1 },
    ]);
    expect(body.byLikes).toEqual([{ id: mira, title: "Mira", count: 1 }]);
  });

  describe("health", () => {
    let chatId: string;
    const addReplies = (count: number, createdAt = minutesAgo(10)) =>
      prisma.message.createMany({
        data: Array.from({ length: count }, (_, index) => ({ chatId, role: "assistant" as const, content: "Hi", position: index + 1, createdAt })),
      });
    const addFailures = (count: number, createdAt = minutesAgo(10)) =>
      prisma.appEvent.createMany({ data: Array.from({ length: count }, () => ({ type: "ai_reply_failed" as const, createdAt })) });
    const health = async () => (await get("/admin/overview/health").expect(200)).body as OverviewHealth;

    beforeEach(async () => {
      chatId = await startChat(app, member, await createCharacter(app, member.cookie));
    });

    it("is ok with no failures in the last hour, and counts only the last hour", async () => {
      await addReplies(3);
      await addFailures(4, minutesAgo(90));
      expect(await health()).toEqual({ status: "ok", replies: 3, failedReplies: 0 });
    });

    it("is some_problems when 10% or more of the replies failed", async () => {
      await addReplies(9);
      await addFailures(1);
      expect(await health()).toEqual({ status: "some_problems", replies: 9, failedReplies: 1 });
    });

    it("is down when 5 or more replies were tried and 50% or more failed", async () => {
      await addReplies(2);
      await addFailures(3);
      expect((await health()).status).toBe("down");
    });

    it("is some_problems, not down, when fewer than 5 replies were tried", async () => {
      await addFailures(2);
      expect((await health()).status).toBe("some_problems");
    });
  });
});
