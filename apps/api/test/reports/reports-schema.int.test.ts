import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const prisma = new PrismaService(testEnv());

function createUser(n: number) {
  return prisma.user.create({
    data: { email: `report${n}@example.com`, googleSub: `report-sub-${n}`, name: `User ${n}`, handle: `report_${n}` },
  });
}

/** Makes a creator with one character, a reporter, and one report. */
async function reportFixture() {
  const creator = await createUser(1);
  const reporter = await createUser(2);
  const character = await prisma.character.create({
    data: { creatorId: creator.id, title: "Mira", bio: "Bio", personality: "Calm" },
  });
  const report = await prisma.report.create({
    data: { characterId: character.id, characterTitle: character.title, reporterId: reporter.id, reason: "hate" },
  });
  return { creator, reporter, character, report };
}

describe("schema for reports", () => {
  beforeEach(async () => {
    await prisma.report.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a user can report one character only one time", async () => {
    const { character, reporter } = await reportFixture();
    const again = prisma.report.create({
      data: { characterId: character.id, characterTitle: "Mira", reporterId: reporter.id, reason: "other" },
    });
    await expect(again).rejects.toMatchObject({ code: "P2002" });
  });

  it("a delete of the character keeps the report and its title copy", async () => {
    const { character, report } = await reportFixture();
    await prisma.character.delete({ where: { id: character.id } });
    const kept = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(kept.characterId).toBeNull();
    expect(kept.characterTitle).toBe("Mira");
    expect(kept.status).toBe("open");
  });

  it("a delete of the reporter keeps the report without the reporter", async () => {
    const { reporter, report } = await reportFixture();
    await prisma.user.delete({ where: { id: reporter.id } });
    const kept = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(kept.reporterId).toBeNull();
  });
});
