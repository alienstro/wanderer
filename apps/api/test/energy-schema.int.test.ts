import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { testEnv } from "./support/env.js";

const prisma = new PrismaService(testEnv());

describe("schema for energy and free models", () => {
  beforeEach(async () => {
    await prisma.freeModel.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("has one settings row with the start values", async () => {
    const rows = await prisma.energySettings.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      dailyEnergy: 2000,
      choicesPrice: 0,
      memoryPrice: 100,
      sceneModelKey: "flux-schnell",
      globalMarkupPercent: 0,
      textMarkupPercent: null,
      imageMarkupPercent: null,
      freeDailyCap: 950,
    });
  });

  it("refuses a second settings row and a daily amount below 0", async () => {
    await expect(prisma.energySettings.create({ data: { id: 2 } })).rejects.toThrow();
    await expect(prisma.energySettings.update({ where: { id: 1 }, data: { dailyEnergy: -1 } })).rejects.toThrow();
  });

  it("has the two supported scene models", async () => {
    const rows = await prisma.sceneModel.findMany({ orderBy: { key: "asc" } });

    expect(rows.map((row) => [row.key, row.costUsd.toString()])).toEqual([
      ["flux-schnell", "0.003"],
      ["z-image-turbo", "0.005"],
    ]);
  });

  it("allows only one default free model", async () => {
    await prisma.freeModel.create({ data: { openrouterId: "a/one:free", displayName: "One", isDefault: true } });

    await expect(
      prisma.freeModel.create({ data: { openrouterId: "b/two:free", displayName: "Two", isDefault: true } }),
    ).rejects.toThrow();
  });

  it("refuses a manual price below 0", async () => {
    await expect(
      prisma.freeModel.create({ data: { openrouterId: "a/one:free", displayName: "One", manualEnergyPrice: -1 } }),
    ).rejects.toThrow();
  });
});
