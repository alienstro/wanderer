import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FILE_STORAGE } from "../src/files/file-storage.js";
import { FilesService } from "../src/files/files.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { characterInput, createCharacter, postCharacter } from "./support/characters.js";
import { WEB_ORIGIN } from "./support/env.js";
import { pngImage } from "./support/images.js";
import { MemoryStorage } from "./support/memory-storage.js";
import { type TestUser, userWithSession } from "./support/users.js";

describe("character create, read, update, and delete", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const storage = new MemoryStorage();
  let owner: TestUser;
  let other: TestUser;

  const http = () => request(app.getHttpServer());
  const get = (id: string, cookie = "") => http().get(`/characters/${id}`).set("Cookie", cookie);
  const patch = (id: string, cookie: string, body: object) =>
    http().patch(`/characters/${id}`).set("Origin", WEB_ORIGIN).set("Cookie", cookie).send(body);
  const del = (id: string, cookie: string) =>
    http().delete(`/characters/${id}`).set("Origin", WEB_ORIGIN).set("Cookie", cookie);

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: FILE_STORAGE, useValue: storage }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    storage.files.clear();
    owner = await userWithSession(app, 1);
    other = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /characters with publish false saves a private draft", async () => {
    const res = await postCharacter(app, owner.cookie, characterInput({ publish: false, isPublic: false })).expect(201);
    expect(res.body).toMatchObject({ title: "Mira", status: "draft", isPublic: false, isOwner: true, creatorHandle: "user_1" });
    expect(res.body.tags).toEqual([{ slug: "sci-fi", label: "SciFi" }]);
  });

  it("with publish true and isPublic true it is published", async () => {
    const res = await postCharacter(app, owner.cookie, characterInput({ publish: true, isPublic: true })).expect(201);
    expect(res.body).toMatchObject({ status: "published", isPublic: true });
    const read = await get(res.body.id).expect(200);
    expect(read.body).toMatchObject({ id: res.body.id, isOwner: false, chatCount: 0 });
  });

  it("the openings keep their order, and PATCH with three openings in a new order saves that order", async () => {
    const id = await createCharacter(app, owner.cookie, { openings: ["one", "two", "three"] });
    expect((await get(id, owner.cookie).expect(200)).body.openings).toEqual(["one", "two", "three"]);

    const res = await patch(id, owner.cookie, characterInput({ openings: ["three", "one", "two"] })).expect(200);
    expect(res.body.openings).toEqual(["three", "one", "two"]);
    expect((await get(id, owner.cookie).expect(200)).body.openings).toEqual(["three", "one", "two"]);
  });

  it("a second character with the same title for the same creator gives 409 title_taken", async () => {
    await createCharacter(app, owner.cookie);
    const res = await postCharacter(app, owner.cookie, characterInput()).expect(409);
    expect(res.body).toEqual({ error: "title_taken" });
  });

  it("an invalid body gives 400 invalid_character with the field names", async () => {
    const res = await postCharacter(app, owner.cookie, characterInput({ title: "", openings: [] })).expect(400);
    expect(res.body).toEqual({ error: "invalid_character", fields: ["title", "openings"] });
  });

  it("an avatarFileId of another user gives 400 invalid_avatar", async () => {
    const file = await app.get(FilesService).saveAvatar(other.user.id, await pngImage());
    const res = await postCharacter(app, owner.cookie, characterInput({ avatarFileId: file.id })).expect(400);
    expect(res.body).toEqual({ error: "invalid_avatar" });
  });

  it("another user gets 404 for GET, PATCH, and DELETE of a draft, and for GET of a private character", async () => {
    const draft = await createCharacter(app, owner.cookie, { title: "Draft", publish: false });
    const hidden = await createCharacter(app, owner.cookie, { title: "Private", isPublic: false });

    await get(draft, other.cookie).expect(404);
    await get(draft).expect(404);
    await patch(draft, other.cookie, characterInput({ title: "Mine now" })).expect(404);
    await del(draft, other.cookie).expect(404);
    await get(hidden, other.cookie).expect(404);
    await get(hidden, owner.cookie).expect(200);
    await get("not-a-uuid").expect(404);
    expect(await prisma.character.count()).toBe(2);
  });

  it("another user gets definition null when definitionVisible is false, and the owner gets the definition", async () => {
    const id = await createCharacter(app, owner.cookie, { definitionVisible: false });

    const seen = await get(id, other.cookie).expect(200);
    expect(seen.body.definition).toBeNull();
    expect(JSON.stringify(seen.body)).not.toContain("Calm, dry, and loyal.");

    const own = await get(id, owner.cookie).expect(200);
    expect(own.body.definition).toEqual({
      personality: "Calm, dry, and loyal.",
      scenario: "A cargo ship near Titan.",
      exampleDialogs: "{{user}}: Hi\n{{char}}: Hey.",
    });
  });

  it("DELETE by the owner gives 204 and removes the avatar file from the storage", async () => {
    const file = await app.get(FilesService).saveAvatar(owner.user.id, await pngImage());
    const id = await createCharacter(app, owner.cookie, { avatarFileId: file.id });
    expect((await get(id).expect(200)).body.avatarUrl).toBe(`/files/${file.id}`);

    await del(id, owner.cookie).expect(204);

    await get(id, owner.cookie).expect(404);
    expect(storage.files.size).toBe(0);
    expect(await prisma.file.count()).toBe(0);
  });

  it("PATCH with a new avatar removes the old avatar file", async () => {
    const files = app.get(FilesService);
    const first = await files.saveAvatar(owner.user.id, await pngImage());
    const second = await files.saveAvatar(owner.user.id, await pngImage());
    const id = await createCharacter(app, owner.cookie, { avatarFileId: first.id });

    await patch(id, owner.cookie, characterInput({ avatarFileId: second.id })).expect(200);

    expect([...storage.files.keys()]).toEqual([`${second.id}.webp`]);
    expect(await prisma.file.findUnique({ where: { id: first.id } })).toBeNull();
  });

  it("PATCH with only { isPublic: false } changes that field and keeps the others", async () => {
    const file = await app.get(FilesService).saveAvatar(owner.user.id, await pngImage());
    const id = await createCharacter(app, owner.cookie, { avatarFileId: file.id, openings: ["one", "two"], tags: ["noir"] });

    const res = await patch(id, owner.cookie, { isPublic: false }).expect(200);

    expect(res.body).toMatchObject({
      isPublic: false,
      status: "published",
      title: "Mira",
      avatarUrl: `/files/${file.id}`,
      openings: ["one", "two"],
      tags: [{ slug: "noir", label: "Noir" }],
    });
    expect(storage.files.size).toBe(1);
  });

  it("an avatarFileId that another character already uses gives 400 invalid_avatar", async () => {
    const file = await app.get(FilesService).saveAvatar(owner.user.id, await pngImage());
    await createCharacter(app, owner.cookie, { title: "First", avatarFileId: file.id });
    const second = await createCharacter(app, owner.cookie, { title: "Second" });

    expect((await postCharacter(app, owner.cookie, characterInput({ title: "Third", avatarFileId: file.id })).expect(400)).body).toEqual({
      error: "invalid_avatar",
    });
    await patch(second, owner.cookie, { avatarFileId: file.id }).expect(400);
  });

  it("PATCH keeps its 200 when the old avatar file cannot be removed from the storage", async () => {
    const files = app.get(FilesService);
    const first = await files.saveAvatar(owner.user.id, await pngImage());
    const second = await files.saveAvatar(owner.user.id, await pngImage());
    const id = await createCharacter(app, owner.cookie, { avatarFileId: first.id });
    const remove = storage.remove;
    storage.remove = () => Promise.reject(new Error("read-only volume"));
    try {
      await patch(id, owner.cookie, { avatarFileId: second.id }).expect(200);
    } finally {
      storage.remove = remove;
    }
  });

  it("POST without the web Origin gives 403", async () => {
    await http().post("/characters").set("Cookie", owner.cookie).send(characterInput()).expect(403);
    expect(await prisma.character.count()).toBe(0);
  });
});
