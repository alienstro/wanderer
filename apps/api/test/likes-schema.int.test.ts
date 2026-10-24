import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { testEnv } from "./support/env.js";

const prisma = new PrismaService(testEnv());

function createUser(n: number) {
  return prisma.user.create({
    data: { email: `likes${n}@example.com`, googleSub: `likes-sub-${n}`, name: `User ${n}`, handle: `likes_${n}` },
  });
}

async function likeCount(characterId: string): Promise<number> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { likeCount: true } });
  return row.likeCount;
}

describe("schema for character likes", () => {
  let creatorId: string;
  let fanId: string;
  let characterId: string;

  beforeEach(async () => {
    await prisma.user.deleteMany();
    creatorId = (await createUser(1)).id;
    fanId = (await createUser(2)).id;
    characterId = (await prisma.character.create({ data: { creatorId, title: "Mira", bio: "Bio", personality: "Calm" } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("an insert raises the count", async () => {
    await prisma.characterLike.create({ data: { userId: fanId, characterId } });

    expect(await likeCount(characterId)).toBe(1);
  });

  it("a delete lowers the count", async () => {
    await prisma.characterLike.create({ data: { userId: fanId, characterId } });

    await prisma.characterLike.delete({ where: { userId_characterId: { userId: fanId, characterId } } });

    expect(await likeCount(characterId)).toBe(0);
  });

  it("the key blocks a second like", async () => {
    await prisma.characterLike.create({ data: { userId: fanId, characterId } });

    await expect(prisma.characterLike.create({ data: { userId: fanId, characterId } })).rejects.toMatchObject({
      code: "P2002",
    });
    expect(await likeCount(characterId)).toBe(1);
  });

  it("a user delete lowers the count", async () => {
    await prisma.characterLike.create({ data: { userId: fanId, characterId } });

    await prisma.user.delete({ where: { id: fanId } });

    expect(await prisma.characterLike.count()).toBe(0);
    expect(await likeCount(characterId)).toBe(0);
  });

  it("a character delete removes its likes", async () => {
    await prisma.characterLike.create({ data: { userId: fanId, characterId } });

    await prisma.character.delete({ where: { id: characterId } });

    expect(await prisma.characterLike.count()).toBe(0);
  });
});
