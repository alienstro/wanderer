import type { NestExpressApplication } from "@nestjs/platform-express";
import { API_KEY_LIMIT } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";
import { type TestUser, userWithSession } from "./support/users.js";

const KEY = "sk-live-secret-3f9a";

describe("api keys", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let one: TestUser;
  let two: TestUser;

  const api = () => request(app.getHttpServer());
  const post = (user: TestUser, path: string, body: object = {}) =>
    api().post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const patch = (user: TestUser, path: string, body: object) =>
    api().patch(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const del = (user: TestUser, path: string) => api().delete(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie);
  const get = (user: TestUser, path: string) => api().get(path).set("Cookie", user.cookie);

  /** A proxy row that uses the key. The proxy routes are not under test here. */
  const addModel = (user: TestUser, apiKeyId: string, name: string) =>
    prisma.proxy.create({
      data: { userId: user.user.id, name, baseUrl: "https://openrouter.ai/api/v1", model: "m", apiKeyId },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    one = await userWithSession(app, 1);
    two = await userWithSession(app, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api-keys saves a key, and the answer has keyLast4 and no key", async () => {
    const res = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    expect(res.body).toMatchObject({ name: "OpenRouter", keyLast4: "3f9a", modelCount: 0 });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.keyVersion).toBe(2);
    expect(Buffer.from(row.keyCiphertext).toString("utf8")).not.toContain(KEY);
  });

  it("GET /api-keys lists only the keys of the user, with modelCount", async () => {
    const own = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    await post(two, "/api-keys", { name: "Other", apiKey: "sk-other-0000" }).expect(201);
    await addModel(one, own.body.id, "A");
    await addModel(one, own.body.id, "B");
    const res = await get(one, "/api-keys").expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: own.body.id, name: "OpenRouter", modelCount: 2 });
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  it("POST /api-keys gives 400 for a blank name and a missing key", async () => {
    const res = await post(one, "/api-keys", { name: "   " }).expect(400);
    expect(res.body).toEqual({ error: "invalid_api_key", fields: ["name", "apiKey"] });
  });

  it("PATCH /api-keys/:id gives 400 for an empty body", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    const res = await patch(one, `/api-keys/${key.body.id}`, {}).expect(400);
    expect(res.body.error).toBe("invalid_api_key");
  });

  it("PATCH /api-keys/:id renames the key and keeps the key", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    const before = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.body.id } });
    const res = await patch(one, `/api-keys/${key.body.id}`, { name: "Work" }).expect(200);
    expect(res.body).toMatchObject({ name: "Work", keyLast4: "3f9a" });
    const after = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.body.id } });
    expect(Buffer.from(after.keyCiphertext).equals(Buffer.from(before.keyCiphertext))).toBe(true);
  });

  it("PATCH /api-keys/:id replaces the key and keyLast4", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    const res = await patch(one, `/api-keys/${key.body.id}`, { apiKey: "sk-new-77bb" }).expect(200);
    expect(res.body).toMatchObject({ name: "OpenRouter", keyLast4: "77bb" });
    expect(JSON.stringify(res.body)).not.toContain("sk-new-77bb");
  });

  it(`the key after ${API_KEY_LIMIT} keys gives 409 api_key_limit`, async () => {
    await prisma.apiKey.createMany({
      data: Array.from({ length: API_KEY_LIMIT }, (_, i) => ({
        userId: one.user.id,
        name: `Key ${i}`,
        keyCiphertext: new Uint8Array([1]),
        keyIv: new Uint8Array(12),
        keyTag: new Uint8Array(16),
        keyVersion: 2,
        keyLast4: "0000",
      })),
    });
    const res = await post(one, "/api-keys", { name: "One more", apiKey: KEY }).expect(409);
    expect(res.body).toEqual({ error: "api_key_limit" });
    expect(await prisma.apiKey.count({ where: { userId: one.user.id } })).toBe(API_KEY_LIMIT);
  });

  it("DELETE /api-keys/:id of a key in use gives 409 with the model names, and the key stays", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    await addModel(one, key.body.id, "DeepSeek");
    await addModel(one, key.body.id, "Claude");
    const res = await del(one, `/api-keys/${key.body.id}`).expect(409);
    expect(res.body).toEqual({ error: "api_key_in_use", models: ["DeepSeek", "Claude"] });
    expect(await prisma.apiKey.count({ where: { id: key.body.id } })).toBe(1);
  });

  it("DELETE /api-keys/:id of a free key gives 204", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    await del(one, `/api-keys/${key.body.id}`).expect(204);
    expect(await prisma.apiKey.count({ where: { id: key.body.id } })).toBe(0);
  });

  it("a key of another user gives 404 on PATCH and DELETE, and nothing changes", async () => {
    const key = await post(one, "/api-keys", { name: "OpenRouter", apiKey: KEY }).expect(201);
    expect((await patch(two, `/api-keys/${key.body.id}`, { name: "Stolen" }).expect(404)).body).toEqual({
      error: "not_found",
    });
    await del(two, `/api-keys/${key.body.id}`).expect(404);
    await del(two, "/api-keys/not-a-uuid").expect(404);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.body.id } });
    expect(row.name).toBe("OpenRouter");
  });

  it("a visitor gets 401", async () => {
    await api().get("/api-keys").expect(401);
  });
});
