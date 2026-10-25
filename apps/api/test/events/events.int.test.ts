import { randomUUID } from "node:crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sendAppEvent } from "../../src/events/app-events.js";
import { EVENT_KEEP_DAYS, EventsService } from "../../src/events/events.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const prisma = new PrismaService(testEnv());
const emitter = new EventEmitter2();
const events = new EventsService(prisma, emitter);
events.subscribe();

describe("EventsService", () => {
  beforeEach(async () => {
    await prisma.appEvent.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records an event with its fields", async () => {
    const user = await prisma.user.create({ data: { email: "user@example.com", googleSub: "google-sub-1", name: "User" } });

    await events.record("ai_reply_failed", { userId: user.id, reason: "timeout" });

    const rows = await prisma.appEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "ai_reply_failed", userId: user.id, characterId: null, reason: "timeout" });
  });

  it("saves a row for an event that another module sends", async () => {
    const user = await prisma.user.create({ data: { email: "user@example.com", googleSub: "google-sub-1", name: "User" } });

    await sendAppEvent(emitter, "summary_failed", { userId: user.id, reason: "empty_summary" });

    const rows = await prisma.appEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "summary_failed", userId: user.id, reason: "empty_summary" });
  });

  it("does not throw when the write of a sent event fails", async () => {
    await expect(sendAppEvent(emitter, "login", { userId: randomUUID() })).resolves.toBeUndefined();
    expect(await prisma.appEvent.count()).toBe(0);
  });

  it("does not throw when the write fails", async () => {
    // No user has this id, so the foreign key stops the insert.
    await expect(events.record("login", { userId: randomUUID() })).resolves.toBeUndefined();
    expect(await prisma.appEvent.count()).toBe(0);
  });

  it("prune deletes only rows older than 90 days", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    await prisma.appEvent.createMany({
      data: [
        { type: "login", createdAt: daysAgo(EVENT_KEEP_DAYS + 1) },
        { type: "login", createdAt: daysAgo(EVENT_KEEP_DAYS - 1) },
        { type: "login", createdAt: now },
      ],
    });

    expect(await events.prune(now)).toBe(1);
    expect(await prisma.appEvent.count()).toBe(2);
  });

  it("prune keeps the admin changes, because they are the audit record", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    await prisma.appEvent.create({
      data: { type: "admin_change", reason: "settings", createdAt: new Date(now.getTime() - (EVENT_KEEP_DAYS + 1) * DAY_MS) },
    });

    expect(await events.prune(now)).toBe(0);
    expect(await prisma.appEvent.count()).toBe(1);
  });
});
