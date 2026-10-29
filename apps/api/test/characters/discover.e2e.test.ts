import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CharacterCard, CharacterListResponse, MyCharacterCard } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CharacterStatus } from "../../src/generated/prisma/client.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { type TestUser, userWithSession } from "../support/users.js";

const BASE_TIME = new Date("2026-10-01T00:00:00.000Z").getTime();

interface SeedOptions {
  creatorId?: string;
  chatName?: string;
  chatCount?: number;
  likeCount?: number;
  minute?: number;
  tags?: string[];
  isAdult?: boolean;
  isPublic?: boolean;
  status?: CharacterStatus;
}

describe("Discover list, search, and tags", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let owner: TestUser;

  /** Makes a character in the database. The default is a public, published character with no chats. */
  function seed(title: string, options: SeedOptions = {}) {
    return prisma.character.create({
      data: {
        creatorId: options.creatorId ?? owner.user.id,
        title,
        chatName: options.chatName ?? "",
        bio: "Bio",
        personality: "Calm",
        chatCount: options.chatCount ?? 0,
        likeCount: options.likeCount ?? 0,
        createdAt: new Date(BASE_TIME + (options.minute ?? 0) * 60_000),
        isAdult: options.isAdult ?? false,
        isPublic: options.isPublic ?? true,
        status: options.status ?? "published",
        tags: { create: (options.tags ?? []).map((tagSlug) => ({ tagSlug })) },
      },
    });
  }

  async function list(query: Record<string, string> = {}, cookie = ""): Promise<CharacterListResponse> {
    const res = await request(app.getHttpServer()).get("/characters").query(query).set("Cookie", cookie).expect(200);
    return res.body as CharacterListResponse;
  }

  const titles = (items: CharacterCard[]) => items.map((item) => item.title);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    owner = await userWithSession(app, 1);
  });

  afterAll(async () => {
    await app.close();
  });

  it("the list gives 24 items and a nextCursor, and the next page gives the other public ones with no repeat", async () => {
    for (let i = 0; i < 30; i++) {
      await seed(`Char ${i}`, { chatCount: i % 3, minute: i });
    }
    await seed("Draft", { status: "draft" });

    const first = await list();
    expect(first.items).toHaveLength(24);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await list({ cursor: first.nextCursor ?? "" });
    expect(second.items).toHaveLength(6);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...titles(first.items), ...titles(second.items)]).size).toBe(30);

    const bad = await request(app.getHttpServer()).get("/characters").query({ cursor: "not-a-cursor" }).expect(400);
    expect(bad.body).toEqual({ error: "invalid_cursor" });
  });

  it("sort most_chats orders by chat count, and sort newest by creation time", async () => {
    await seed("Old popular", { chatCount: 10, minute: 1 });
    await seed("Middle", { chatCount: 5, minute: 2 });
    await seed("New quiet", { chatCount: 1, minute: 3 });
    await seed("Newest quiet", { chatCount: 1, minute: 4 });

    expect(titles((await list({ sort: "most_chats" })).items)).toEqual(["Old popular", "Middle", "Newest quiet", "New quiet"]);
    expect(titles((await list({ sort: "newest" })).items)).toEqual(["Newest quiet", "New quiet", "Middle", "Old popular"]);
  });

  it("sort most_liked orders by like count, then by creation time", async () => {
    await seed("Liked", { likeCount: 5, chatCount: 0, minute: 1 });
    await seed("Most liked", { likeCount: 9, chatCount: 1, minute: 2 });
    await seed("Old unliked", { likeCount: 0, chatCount: 50, minute: 3 });
    await seed("New unliked", { likeCount: 0, chatCount: 50, minute: 4 });

    expect(titles((await list({ sort: "most_liked" })).items)).toEqual(["Most liked", "Liked", "New unliked", "Old unliked"]);
  });

  it("sort most_liked pages have no repeat and no gap when like counts are equal", async () => {
    for (let i = 0; i < 30; i++) {
      await seed(`Char ${i}`, { chatCount: i % 3, likeCount: (i + 1) % 3, minute: i });
    }

    const first = await list({ sort: "most_liked" });
    expect(first.items).toHaveLength(24);
    const second = await list({ sort: "most_liked", cursor: first.nextCursor ?? "" });
    expect(second.items).toHaveLength(6);
    expect(second.nextCursor).toBeNull();

    const items = [...first.items, ...second.items];
    expect(new Set(titles(items)).size).toBe(30);
    const counts = items.map((item) => item.likeCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("tag=noir gives only noir characters", async () => {
    await seed("Detective", { tags: ["noir", "mystery"] });
    await seed("Knight", { tags: ["fantasy"] });

    const result = await list({ tag: "noir" });
    expect(titles(result.items)).toEqual(["Detective"]);
    expect(result.items[0]?.tags).toEqual([
      { slug: "mystery", label: "Mystery" },
      { slug: "noir", label: "Noir" },
    ]);
  });

  it("q matches the title, the chat name, a tag label, and the creator handle", async () => {
    const writer = await userWithSession(app, 7);
    await prisma.user.update({ where: { id: writer.user.id }, data: { handle: "ghostwriter" } });
    await seed("Mira Vale");
    await seed("Captain", { chatName: "Rook" });
    await seed("Station", { tags: ["sci-fi"] });
    await seed("Poet", { creatorId: writer.user.id });

    expect(titles((await list({ q: "mira" })).items)).toEqual(["Mira Vale"]);
    expect(titles((await list({ q: "ROOK" })).items)).toEqual(["Captain"]);
    expect(titles((await list({ q: "scifi" })).items)).toEqual(["Station"]);
    expect(titles((await list({ q: "ghostwr" })).items)).toEqual(["Poet"]);
  });

  it('q="100%" matches only a title with "100%", q="a_b" does not match "axb", and a 101-character q gives 400', async () => {
    await seed("100% Pure");
    await seed("1000 Years");
    await seed("axb");

    expect(titles((await list({ q: "100%" })).items)).toEqual(["100% Pure"]);
    expect((await list({ q: "a_b" })).items).toEqual([]);
    await request(app.getHttpServer()).get("/characters").query({ q: "a".repeat(101) }).expect(400);
  });

  it("no user gets an old 18+ character from the list, a search, or a tag filter", async () => {
    await seed("Lilith", { isAdult: true, tags: ["horror"] });
    await seed("Ghost", { tags: ["horror"] });
    const plain = await userWithSession(app, 2);
    // The old "Show 18+" setting has no effect now.
    const oldSetting = await userWithSession(app, 3, { showAdult: true, adultConfirmedAt: new Date() });

    for (const cookie of ["", plain.cookie, oldSetting.cookie]) {
      expect(titles((await list({}, cookie)).items)).toEqual(["Ghost"]);
      expect((await list({ q: "lilith" }, cookie)).items).toEqual([]);
      expect(titles((await list({ tag: "horror" }, cookie)).items)).toEqual(["Ghost"]);
    }
  });

  it("GET /me/characters/liked lists the liked characters that the user can see, newest like first", async () => {
    const reader = await userWithSession(app, 9);
    const first = await seed("First like", { minute: 1 });
    const second = await seed("Second like", { minute: 2 });
    const hidden = await seed("Now private", { minute: 3 });
    await seed("Not liked", { minute: 4 });
    for (const [index, character] of [first, second, hidden].entries()) {
      await prisma.characterLike.create({
        data: { userId: reader.user.id, characterId: character.id, createdAt: new Date(BASE_TIME + index * 60_000) },
      });
    }
    await prisma.character.update({ where: { id: hidden.id }, data: { isPublic: false } });

    const res = await request(app.getHttpServer()).get("/me/characters/liked").set("Cookie", reader.cookie).expect(200);
    expect(titles((res.body as { items: CharacterCard[] }).items)).toEqual(["Second like", "First like"]);
    await request(app.getHttpServer()).get("/me/characters/liked").expect(401);
  });

  it("drafts and private characters are not in the list, but GET /me/characters shows them to their creator", async () => {
    await seed("Public", { minute: 1 });
    await seed("Draft", { status: "draft", minute: 2 });
    await seed("Private", { isPublic: false, minute: 3 });

    expect(titles((await list()).items)).toEqual(["Public"]);

    const mine = await request(app.getHttpServer()).get("/me/characters").set("Cookie", owner.cookie).expect(200);
    const cards = mine.body as MyCharacterCard[];
    expect(cards.map((card) => [card.title, card.status, card.isPublic])).toEqual([
      ["Private", "published", false],
      ["Draft", "draft", true],
      ["Public", "published", true],
    ]);
    await request(app.getHttpServer()).get("/me/characters").expect(401);
  });

  it("GET /tags gives the 10 tags", async () => {
    const res = await request(app.getHttpServer()).get("/tags").expect(200);
    expect(res.body).toHaveLength(10);
    expect(res.body[0]).toEqual({ slug: "adventure", label: "Adventure" });
  });
});
