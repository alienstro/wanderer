import type { FreeModel, Prisma } from "../../src/generated/prisma/client.js";
import type { PrismaService } from "../../src/prisma/prisma.service.js";

/** The server key in the tests. The tests check that no response holds it. */
export const SERVER_KEY = "sk-or-server-test-key";

/**
 * Saves an enabled free model with the prices of google/gemma-4-31b-it: a reply costs $0.00336, so 0.34 energy
 * with a markup of 0%. The free_models table is not under users, so each test file deletes its rows.
 */
export function addFreeModel(prisma: PrismaService, data: Partial<Prisma.FreeModelCreateInput> = {}): Promise<FreeModel> {
  return prisma.freeModel.create({
    data: {
      openrouterId: "google/gemma-4-31b-it:free",
      displayName: "Gemma",
      enabled: true,
      promptPriceUsd: "0.0000002",
      completionPriceUsd: "0.0000004",
      pricesFetchedAt: new Date(),
      ...data,
    },
  });
}

/** Puts the energy settings back to the start values, because the row stays between test files. */
export function resetEnergySettings(prisma: PrismaService) {
  return prisma.energySettings.update({
    where: { id: 1 },
    data: {
      dailyEnergy: 2000,
      choicesPrice: 0,
      memoryPrice: 100,
      sceneModelKey: "flux-schnell",
      globalMarkupPercent: 0,
      textMarkupPercent: null,
      imageMarkupPercent: null,
      freeDailyCap: 950,
      updatedById: null,
    },
  });
}
