import { HttpException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { EnergyService } from "../../src/energy/energy.service.js";
import { EventsService } from "../../src/events/events.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const prisma = new PrismaService(testEnv());
// The events service listens, so an energy_too_low event saves a row as in the app.
const emitter = new EventEmitter2();
new EventsService(prisma, emitter).subscribe();
const energy = new EnergyService(prisma, emitter);

async function balanceOf(userId: string): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).energy;
}

/** The error body of a refused spend, or null when the spend went through. */
async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof HttpException) {
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw error;
  }
}

describe("EnergyService", () => {
  let userId: string;

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.appEvent.deleteMany();
    await prisma.freeModel.deleteMany();
    await prisma.energySettings.update({ where: { id: 1 }, data: { dailyEnergy: 2000 } });
    userId = (await prisma.user.create({ data: { email: "user@example.com", googleSub: "google-sub-1", name: "User" } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("gives a new user the daily amount at the first read, with one refill row", async () => {
    const view = await energy.balance(userId);

    expect(view.balance).toBe(2000);
    expect(view.dailyEnergy).toBe(2000);
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    expect(view.nextRefillAt.toISOString()).toBe(tomorrow.toISOString());
    expect(await prisma.energyEntry.findMany({ where: { userId } })).toMatchObject([{ amount: 2000, reason: "refill" }]);
  });

  it("200 spends of 0.5 from a balance of 100 leave exactly 0", async () => {
    await prisma.energySettings.update({ where: { id: 1 }, data: { dailyEnergy: 10_000 } });

    for (let i = 0; i < 200; i++) {
      await energy.spend(userId, 50, "choices");
    }

    expect(await balanceOf(userId)).toBe(0);
    expect(await refusal(energy.spend(userId, 1, "choices"))).toMatchObject({ status: 429 });
  });

  it("refuses a spend above the balance with the balance, the price and the refill time, and records an event", async () => {
    await energy.spend(userId, 1990, "scene");

    const refused = await refusal(energy.spend(userId, 30, "scene"));

    expect(refused).toEqual({
      status: 429,
      body: { error: "energy_low", balance: 0.1, price: 0.3, nextRefillAt: expect.any(String) },
    });
    expect(await balanceOf(userId)).toBe(10);
    expect(await prisma.appEvent.findMany()).toMatchObject([{ type: "energy_too_low", userId, reason: "scene" }]);
  });

  it("two spends at the same time with energy for one give one spend and one refusal", async () => {
    await energy.balance(userId);
    await prisma.user.update({ where: { id: userId }, data: { energy: 30 } });

    const results = await Promise.all([refusal(energy.spend(userId, 30, "scene")), refusal(energy.spend(userId, 30, "scene"))]);

    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(0);
  });

  it("refills to the daily amount on a new day, not more", async () => {
    await energy.spend(userId, 500, "scene");
    await prisma.user.update({ where: { id: userId }, data: { energyRefilledAt: new Date(Date.now() - DAY_MS) } });

    expect((await energy.balance(userId)).balance).toBe(2000);
    const refills = await prisma.energyEntry.findMany({ where: { userId, reason: "refill" }, orderBy: { seq: "asc" } });
    expect(refills.map((row) => row.amount)).toEqual([2000, 500]);
  });

  it("a refund gives the energy back one time", async () => {
    const spend = await energy.spend(userId, 34, "reply");

    await energy.refund(spend);
    await energy.refund(spend);

    expect(await balanceOf(userId)).toBe(2000);
    expect(await prisma.energyEntry.count({ where: { reason: "refund", refundOfId: spend.id } })).toBe(1);
  });

  it("a refund after a refill does not raise the balance above the daily amount", async () => {
    const spend = await energy.spend(userId, 34, "reply");
    await prisma.user.update({ where: { id: userId }, data: { energyRefilledAt: new Date(Date.now() - DAY_MS) } });
    await energy.balance(userId);

    await energy.refund(spend);

    expect(await balanceOf(userId)).toBe(2000);
  });

  it("counts the free model requests of today for all users", async () => {
    const model = await prisma.freeModel.create({ data: { openrouterId: "count/test:free", displayName: "Count" } });
    await energy.spend(userId, 34, "reply", { freeModelId: model.id });
    await energy.spend(userId, 0, "choices", { freeModelId: model.id });
    await energy.spend(userId, 30, "scene");

    expect(await energy.freeRequestsToday()).toBe(2);
  });

  it("a user with an own daily amount refills to it, not to the global amount", async () => {
    await prisma.user.update({ where: { id: userId }, data: { dailyEnergy: 5000 } });

    expect(await energy.balance(userId)).toMatchObject({ balance: 5000, dailyEnergy: 5000 });
  });

  it("an admin add refills first when a refill is due, then saves one admin row", async () => {
    const result = await energy.adjust(userId, { mode: "add", amount: 1000 });

    expect(result).toEqual({ before: 2000, after: 3000 });
    expect(await balanceOf(userId)).toBe(3000);
    const rows = await prisma.energyEntry.findMany({ where: { userId }, orderBy: { seq: "asc" } });
    expect(rows.map((row) => [row.reason, row.amount])).toEqual([
      ["refill", 2000],
      ["admin", 1000],
    ]);
  });

  it("an admin add lasts until the next refill, which sets the daily amount again", async () => {
    await energy.adjust(userId, { mode: "add", amount: 1000 });
    await prisma.user.update({ where: { id: userId }, data: { energyRefilledAt: new Date(Date.now() - DAY_MS) } });

    expect((await energy.balance(userId)).balance).toBe(2000);
  });

  it("an admin set gives an exact balance, and a take-away below 0 is refused", async () => {
    expect(await energy.adjust(userId, { mode: "set", amount: 50 })).toEqual({ before: 2000, after: 50 });
    expect(await refusal(energy.adjust(userId, { mode: "add", amount: -51 }))).toMatchObject({
      status: 400,
      body: { error: "energy_below_zero" },
    });
    expect(await energy.adjust(userId, { mode: "add", amount: -50 })).toEqual({ before: 50, after: 0 });
  });
});
