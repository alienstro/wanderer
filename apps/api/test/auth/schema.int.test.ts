import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const prisma = new PrismaService(testEnv());

function userData(n: number, extra: { email?: string; handle?: string } = {}) {
  return {
    email: extra.email ?? `user${n}@example.com`,
    googleSub: `google-sub-${n}`,
    name: `User ${n}`,
    handle: extra.handle ?? null,
  };
}

describe("schema for users, sessions, and terms", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("two users with the same email fail with P2002", async () => {
    await prisma.user.create({ data: userData(1, { email: "same@example.com" }) });
    await expect(
      prisma.user.create({ data: userData(2, { email: "same@example.com" }) }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("two users with the same handle fail with P2002", async () => {
    await prisma.user.create({ data: userData(1, { handle: "tian" }) });
    await expect(prisma.user.create({ data: userData(2, { handle: "tian" }) })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("the delete of a user deletes their sessions and terms acceptances", async () => {
    const user = await prisma.user.create({ data: userData(1) });
    await prisma.session.create({
      data: { userId: user.id, tokenHash: "hash-1", expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.termsAcceptance.create({ data: { userId: user.id, version: "2026-10-21" } });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.termsAcceptance.count({ where: { userId: user.id } })).toBe(0);
  });
});
