import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Persona, PersonaListResponse } from "@wanderer/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type TestUser, userWithSession } from "../support/users.js";

describe("personas", () => {
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
  const list = async (user: TestUser): Promise<Persona[]> =>
    ((await api().get("/personas").set("Cookie", user.cookie)).body as PersonaListResponse).personas;
  const add = async (user: TestUser, name: string): Promise<Persona> => {
    const res = await post(user, "/personas", { name });
    expect(res.status).toBe(201);
    return res.body as Persona;
  };

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

  it("needs a session", async () => {
    expect((await api().get("/personas")).status).toBe(401);
    expect((await api().post("/personas").set("Origin", WEB_ORIGIN).send({ name: "Aria" })).status).toBe(401);
  });

  it("creates, lists, edits and deletes a persona", async () => {
    const created = await post(one, "/personas", { name: " Aria ", description: " A knight. " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Aria", description: "A knight.", isDefault: true });

    const id = (created.body as Persona).id;
    expect((await list(one)).map((p) => p.name)).toEqual(["Aria"]);

    const edited = await patch(one, `/personas/${id}`, { name: "Aria", description: "A student." });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id, description: "A student.", isDefault: true });

    expect((await del(one, `/personas/${id}`)).status).toBe(204);
    expect(await list(one)).toEqual([]);
  });

  it("makes the first persona the default", async () => {
    await add(one, "Aria");
    await add(one, "Sam");
    expect((await list(one)).map((p) => [p.name, p.isDefault])).toEqual([
      ["Aria", true],
      ["Sam", false],
    ]);
  });

  it("rejects a 4th persona with 409 persona_limit", async () => {
    await add(one, "A");
    await add(one, "B");
    await add(one, "C");
    const res = await post(one, "/personas", { name: "D" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "persona_limit" });
    expect(await list(one)).toHaveLength(3);
  });

  it("makes no 4th persona from two requests at the same time", async () => {
    await add(one, "A");
    await add(one, "B");
    const results = await Promise.all([post(one, "/personas", { name: "C" }), post(one, "/personas", { name: "D" })]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await prisma.persona.count({ where: { userId: one.user.id } })).toBe(3);
  });

  it("moves the default with POST /personas/:id/default", async () => {
    await add(one, "Aria");
    const sam = await add(one, "Sam");
    const res = await post(one, `/personas/${sam.id}/default`);
    expect(res.status).toBe(200);
    expect((res.body as PersonaListResponse).personas.map((p) => [p.name, p.isDefault])).toEqual([
      ["Aria", false],
      ["Sam", true],
    ]);

    const again = await post(one, `/personas/${sam.id}/default`);
    expect(again.status).toBe(200);
    expect((await list(one)).filter((p) => p.isDefault).map((p) => p.name)).toEqual(["Sam"]);
  });

  it("promotes the oldest other persona when the default is deleted", async () => {
    const aria = await add(one, "Aria");
    await add(one, "Sam");
    await add(one, "Kai");
    expect((await del(one, `/personas/${aria.id}`)).status).toBe(204);
    expect((await list(one)).map((p) => [p.name, p.isDefault])).toEqual([
      ["Sam", true],
      ["Kai", false],
    ]);
  });

  it("leaves no default when the only persona is deleted", async () => {
    const aria = await add(one, "Aria");
    expect((await del(one, `/personas/${aria.id}`)).status).toBe(204);
    expect(await list(one)).toEqual([]);
    const next = await add(one, "Sam");
    expect(next.isDefault).toBe(true);
  });

  it("rejects a whitespace-only name with 400 invalid_persona", async () => {
    const res = await post(one, "/personas", { name: "   " });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_persona" });
    const aria = await add(one, "Aria");
    const edit = await patch(one, `/personas/${aria.id}`, { name: "" });
    expect(edit.status).toBe(400);
    expect(edit.body).toEqual({ error: "invalid_persona" });
  });

  it("gives 404 for the persona of another user", async () => {
    await add(one, "Aria");
    const sam = await add(one, "Sam");
    const notFound = { error: "not_found" };

    const edit = await patch(two, `/personas/${sam.id}`, { name: "Mallory" });
    expect([edit.status, edit.body]).toEqual([404, notFound]);
    const makeDefault = await post(two, `/personas/${sam.id}/default`);
    expect([makeDefault.status, makeDefault.body]).toEqual([404, notFound]);
    const remove = await del(two, `/personas/${sam.id}`);
    expect([remove.status, remove.body]).toEqual([404, notFound]);
    expect((await del(one, "/personas/not-a-uuid")).status).toBe(404);

    expect((await list(one)).map((p) => [p.name, p.isDefault])).toEqual([
      ["Aria", true],
      ["Sam", false],
    ]);
    expect(await list(two)).toEqual([]);
  });
});
