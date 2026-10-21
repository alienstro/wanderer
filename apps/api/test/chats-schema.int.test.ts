import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { testEnv } from "./support/env.js";

const prisma = new PrismaService(testEnv());

function createUser(n: number) {
  return prisma.user.create({
    data: { email: `chats${n}@example.com`, googleSub: `chats-sub-${n}`, name: `User ${n}`, handle: `chats_${n}` },
  });
}

function createCharacter(creatorId: string) {
  return prisma.character.create({ data: { creatorId, title: "Mira", bio: "Bio", personality: "Calm" } });
}

function createProxy(userId: string) {
  return prisma.proxy.create({
    data: {
      userId,
      name: "Main",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-test",
      keyCiphertext: Buffer.from("c"),
      keyIv: Buffer.alloc(12),
      keyTag: Buffer.alloc(16),
      keyVersion: 1,
      keyLast4: "3f9a",
    },
  });
}

describe("schema for proxies, chats, and messages", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("two messages with one position in one chat fail with P2002", async () => {
    const user = await createUser(1);
    const character = await createCharacter(user.id);
    const chat = await prisma.chat.create({ data: { userId: user.id, characterId: character.id, title: "Mira" } });
    await prisma.message.create({ data: { chatId: chat.id, role: "assistant", content: "Hi", position: 0 } });
    await expect(
      prisma.message.create({ data: { chatId: chat.id, role: "user", content: "Hey", position: 0 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("the delete of a character deletes its chats and messages", async () => {
    const user = await createUser(1);
    const character = await createCharacter(user.id);
    const chat = await prisma.chat.create({ data: { userId: user.id, characterId: character.id, title: "Mira" } });
    await prisma.message.create({ data: { chatId: chat.id, role: "assistant", content: "Hi", position: 0 } });
    await prisma.character.delete({ where: { id: character.id } });
    expect(await prisma.chat.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });

  it("the delete of the active proxy sets activeProxyId to null", async () => {
    const user = await createUser(1);
    const proxy = await createProxy(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { activeProxyId: proxy.id } });
    await prisma.proxy.delete({ where: { id: proxy.id } });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.activeProxyId).toBeNull();
    expect(after.replyChoicesOn).toBe(true);
  });

  it("the delete of a user deletes their proxies and chats", async () => {
    const user = await createUser(1);
    const other = await createUser(2);
    const character = await createCharacter(other.id);
    await createProxy(user.id);
    await prisma.chat.create({ data: { userId: user.id, characterId: character.id, title: "Mira" } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.proxy.count()).toBe(0);
    expect(await prisma.chat.count()).toBe(0);
  });
});
