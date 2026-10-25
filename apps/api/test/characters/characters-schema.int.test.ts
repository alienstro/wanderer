import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { testEnv } from "../support/env.js";

const prisma = new PrismaService(testEnv());

function createUser(n: number) {
  return prisma.user.create({
    data: { email: `schema${n}@example.com`, googleSub: `schema-sub-${n}`, name: `User ${n}`, handle: `schema_${n}` },
  });
}

function characterData(creatorId: string, title = "Mira") {
  return { creatorId, title, bio: "Bio", personality: "Calm" };
}

describe("schema for characters, tags, and files", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("the migration adds the 10 tags", async () => {
    const tags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });
    expect(tags.map((tag) => tag.slug)).toEqual([
      "adventure",
      "fantasy",
      "horror",
      "military",
      "mystery",
      "noir",
      "post-apoc",
      "school",
      "sci-fi",
      "slice-of-life",
    ]);
  });

  it("two characters with the same title for one creator fail with P2002", async () => {
    const one = await createUser(1);
    const two = await createUser(2);
    await prisma.character.create({ data: characterData(one.id) });
    await expect(prisma.character.create({ data: characterData(one.id) })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.character.create({ data: characterData(two.id) })).resolves.toBeDefined();
  });

  it("the delete of a character deletes its openings and tag links", async () => {
    const user = await createUser(1);
    const character = await prisma.character.create({
      data: {
        ...characterData(user.id),
        openings: { create: [{ position: 0, text: "Hello" }] },
        tags: { create: [{ tagSlug: "noir" }] },
      },
    });

    await prisma.character.delete({ where: { id: character.id } });

    expect(await prisma.characterOpening.count({ where: { characterId: character.id } })).toBe(0);
    expect(await prisma.characterTag.count({ where: { characterId: character.id } })).toBe(0);
  });

  it("the delete of a user deletes their characters and files", async () => {
    const user = await createUser(1);
    const file = await prisma.file.create({
      data: { ownerId: user.id, path: "a.webp", mime: "image/webp", size: 10, width: 600, height: 800 },
    });
    await prisma.character.create({ data: { ...characterData(user.id), avatarFileId: file.id } });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.character.count({ where: { creatorId: user.id } })).toBe(0);
    expect(await prisma.file.count({ where: { ownerId: user.id } })).toBe(0);
  });
});
