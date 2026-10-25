import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SessionService } from "../../src/auth/session.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const prisma = new PrismaService(testEnv());
const sessions = new SessionService(prisma);

async function makeUser(extra: { bannedAt?: Date } = {}) {
  return prisma.user.create({
    data: { email: "user@example.com", googleSub: "google-sub-1", name: "User", ...extra },
  });
}

describe("SessionService", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("create stores a hash, not the raw token", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);

    const stored = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("validate returns the user for a fresh token", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);

    expect((await sessions.validate(token))?.id).toBe(user.id);
  });

  it("validate returns null for an expired session", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await sessions.validate(token)).toBeNull();
  });

  it("validate returns null when the user has bannedAt set", async () => {
    const user = await makeUser({ bannedAt: new Date() });
    const { token } = await sessions.create(user.id);

    expect(await sessions.validate(token)).toBeNull();
  });

  it("validate moves expiresAt forward when less than 29 days are left", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() + 28 * DAY_MS) } });

    await sessions.validate(token);

    const stored = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29.9 * DAY_MS);
  });

  it("revoke makes validate return null", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);

    await sessions.revoke(token);

    expect(await sessions.validate(token)).toBeNull();
  });

  it("validate returns null, not an error, when a logout deletes the session during a renewal", async () => {
    const user = await makeUser();
    const { token } = await sessions.create(user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() + 28 * DAY_MS) } });
    // The row goes away after the read and before the renewal write, as with a logout in another tab.
    const racingPrisma = {
      session: {
        findUnique: async (args: Parameters<typeof prisma.session.findUnique>[0]) => {
          const found = await prisma.session.findUnique(args);
          await prisma.session.deleteMany({ where: { userId: user.id } });
          return found;
        },
        update: (args: Parameters<typeof prisma.session.update>[0]) => prisma.session.update(args),
        updateMany: (args: Parameters<typeof prisma.session.updateMany>[0]) => prisma.session.updateMany(args),
      },
    } as unknown as PrismaService;

    expect(await new SessionService(racingPrisma).validate(token)).toBeNull();
  });
});
