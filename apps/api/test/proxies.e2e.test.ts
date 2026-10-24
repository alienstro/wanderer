import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { MODEL_LIST_CLIENT } from "../src/ai/model-list.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";
import {
  type FakeAiServer,
  startFakeAiServer,
  UnguardedAiClientFactory,
  UnguardedModelListClient,
} from "./support/fake-ai-server.js";
import { type TestUser, userWithSession } from "./support/users.js";

const KEY = "sk-live-secret-3f9a";

const proxyFields = {
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "deepseek/deepseek-chat",
};

describe("proxies", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  let factory: UnguardedAiClientFactory;
  let modelLists: UnguardedModelListClient;
  let one: TestUser;
  let two: TestUser;
  /** The saved key of user one, and a proxy body that uses it. */
  let keyId: string;
  let proxyBody: typeof proxyFields & { apiKeyId: string };

  const api = () => request(app.getHttpServer());
  const post = (user: TestUser, path: string, body: object = {}) =>
    api().post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const patch = (user: TestUser, path: string, body: object) =>
    api().patch(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body);
  const del = (user: TestUser, path: string) => api().delete(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie);
  const get = (user: TestUser, path: string) => api().get(path).set("Cookie", user.cookie);

  beforeAll(async () => {
    fake = await startFakeAiServer();
    factory = new UnguardedAiClientFactory(fake.url);
    modelLists = new UnguardedModelListClient(fake.url);
    app = await createTestApp({
      overrides: [
        { token: AI_CLIENT_FACTORY, useValue: factory },
        { token: MODEL_LIST_CLIENT, useValue: modelLists },
      ],
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    one = await userWithSession(app, 1);
    two = await userWithSession(app, 2);
    keyId = (await saveKey(one, "OpenRouter", KEY)).id;
    proxyBody = { ...proxyFields, apiKeyId: keyId };
  });

  const saveKey = async (user: TestUser, name: string, apiKey: string): Promise<{ id: string }> =>
    (await post(user, "/api-keys", { name, apiKey }).expect(201)).body;

  afterAll(async () => {
    await app.close();
    await fake.close();
  });

  it("POST /proxies saves a proxy, makes it active, and the answer has the key name, keyLast4 and no key field", async () => {
    const res = await post(one, "/proxies", proxyBody).expect(201);
    expect(res.body).toMatchObject({
      name: "OpenRouter",
      savedKey: { id: keyId, name: "OpenRouter", keyLast4: "3f9a" },
      isActive: true,
      appendPath: true,
    });
    expect(Object.keys(res.body)).not.toContain("apiKey");
    const me = await get(one, "/me").expect(200);
    expect(me.body.activeProxy).toEqual({ id: res.body.id, name: "OpenRouter", model: "deepseek/deepseek-chat" });
    const second = await post(one, "/proxies", { ...proxyBody, name: "Second" }).expect(201);
    expect(second.body.isActive).toBe(false);
  });

  it("no answer of GET, POST, PATCH, or Test holds the key text or a ciphertext field", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    const answers = [
      created,
      await get(one, "/proxies").expect(200),
      await patch(one, `/proxies/${created.body.id}`, { name: "Renamed" }).expect(200),
      await post(one, `/proxies/${created.body.id}/test`).expect(200),
    ];
    for (const res of answers) {
      expect(res.text).not.toContain(KEY);
      expect(res.text).not.toMatch(/ciphertext|keyIv|keyTag/i);
    }
  });

  it("PATCH with no apiKeyId keeps the key, and the next Test sends that key", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    await patch(one, `/proxies/${created.body.id}`, { model: "other-model" }).expect(200);
    await post(one, `/proxies/${created.body.id}/test`).expect(200);
    expect(fake.requests.at(-1)?.authorization).toBe(`Bearer ${KEY}`);
    expect(factory.targets.at(-1)).toMatchObject({
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: "other-model",
    });
  });

  it("POST /proxies with no contextTokens saves 16,000, and PATCH changes it to 2,000", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    expect(created.body.contextTokens).toBe(16_000);
    const res = await patch(one, `/proxies/${created.body.id}`, { contextTokens: 2_000 }).expect(200);
    expect(res.body.contextTokens).toBe(2_000);
  });

  it("a context size of 1,999 or 200,001 gives 400 invalid_proxy and does not save", async () => {
    for (const contextTokens of [1_999, 200_001]) {
      const bad = await post(one, "/proxies", { ...proxyBody, contextTokens }).expect(400);
      expect(bad.body).toEqual({ error: "invalid_proxy", fields: ["contextTokens"] });
    }
    expect(await prisma.proxy.count()).toBe(0);
    const created = await post(one, "/proxies", proxyBody).expect(201);
    await patch(one, `/proxies/${created.body.id}`, { contextTokens: 200_001 }).expect(400);
    const row = await prisma.proxy.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.contextTokens).toBe(16_000);
  });

  it("POST /proxies with https://10.0.0.5 gives 400 blocked_url", async () => {
    const res = await post(one, "/proxies", { ...proxyBody, baseUrl: "https://10.0.0.5/v1" }).expect(400);
    expect(res.body.error).toBe("blocked_url");
    const bad = await post(one, "/proxies", { ...proxyBody, baseUrl: "http://openrouter.ai" }).expect(400);
    expect(bad.body).toEqual({ error: "invalid_proxy", fields: ["baseUrl"] });
  });

  it("the 21st proxy gives 409 proxy_limit", async () => {
    for (let n = 0; n < 20; n++) {
      await post(one, "/proxies", { ...proxyBody, name: `P${n}` }).expect(201);
    }
    const res = await post(one, "/proxies", proxyBody).expect(409);
    expect(res.body.error).toBe("proxy_limit");
  });

  it("activate changes activeProxy in GET /me, and delete of the active proxy sets it to null", async () => {
    await post(one, "/proxies", proxyBody).expect(201);
    const second = await post(one, "/proxies", { ...proxyBody, name: "Second" }).expect(201);
    const activated = await post(one, `/proxies/${second.body.id}/activate`).expect(201);
    expect(activated.body.activeProxy.id).toBe(second.body.id);
    await del(one, `/proxies/${second.body.id}`).expect(204);
    expect((await get(one, "/me").expect(200)).body.activeProxy).toBeNull();
  });

  it("Test gives ok with the reply, and a 401 from the proxy gives invalid_key", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    const ok = await post(one, `/proxies/${created.body.id}/test`).expect(200);
    expect(ok.body).toMatchObject({ ok: true, reply: "OK" });
    expect(typeof ok.body.latencyMs).toBe("number");
    expect(fake.requests.at(-1)?.body.max_tokens).toBe(5);
    fake.next({ status: 401 });
    const bad = await post(one, `/proxies/${created.body.id}/test`).expect(200);
    expect(bad.body).toEqual({ ok: false, error: "invalid_key", message: "The proxy refused the API key." });
  });

  it("another user gets 404 for PATCH, DELETE, activate, and Test", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    const id = created.body.id as string;
    await patch(two, `/proxies/${id}`, { name: "Mine" }).expect(404);
    await del(two, `/proxies/${id}`).expect(404);
    await post(two, `/proxies/${id}/activate`).expect(404);
    await post(two, `/proxies/${id}/test`).expect(404);
    expect((await get(two, "/proxies").expect(200)).body).toEqual([]);
    await post(two, "/proxies/not-a-uuid/test").expect(404);
  });

  it("Test of a proxy whose key does not decrypt gives invalid_key", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    // A changed master key looks like a wrong tag: the saved key does not decrypt.
    await prisma.apiKey.update({ where: { id: keyId }, data: { keyTag: new Uint8Array(16) } });
    const res = await post(one, `/proxies/${created.body.id}/test`).expect(200);
    expect(res.body).toEqual({ ok: false, error: "invalid_key", message: "The proxy refused the API key." });
  });

  it("two models use one saved key, and a replace of the key changes the key that each model sends", async () => {
    const first = await post(one, "/proxies", proxyBody).expect(201);
    const second = await post(one, "/proxies", { ...proxyBody, name: "Second", model: "other" }).expect(201);
    expect(second.body.savedKey.id).toBe(keyId);
    await patch(one, `/api-keys/${keyId}`, { apiKey: "sk-new-77bb" }).expect(200);
    for (const id of [first.body.id, second.body.id]) {
      await post(one, `/proxies/${id}/test`).expect(200);
      expect(fake.requests.at(-1)?.authorization).toBe("Bearer sk-new-77bb");
    }
    expect((await get(one, "/proxies").expect(200)).body[1].savedKey).toEqual({
      id: keyId,
      name: "OpenRouter",
      keyLast4: "77bb",
    });
  });

  it("PATCH with another own key moves the model to that key", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    const other = await saveKey(one, "Work", "sk-work-1234");
    const res = await patch(one, `/proxies/${created.body.id}`, { apiKeyId: other.id }).expect(200);
    expect(res.body.savedKey).toEqual({ id: other.id, name: "Work", keyLast4: "1234" });
    await post(one, `/proxies/${created.body.id}/test`).expect(200);
    expect(fake.requests.at(-1)?.authorization).toBe("Bearer sk-work-1234");
  });

  it("POST /proxies with the key of another user gives 404 and saves nothing", async () => {
    const res = await post(two, "/proxies", proxyBody).expect(404);
    expect(res.body).toEqual({ error: "not_found" });
    expect(await prisma.proxy.count()).toBe(0);
  });

  it("PATCH with the key of another user gives 404, and the model keeps its key", async () => {
    const created = await post(one, "/proxies", proxyBody).expect(201);
    const foreign = await saveKey(two, "Theirs", "sk-theirs-9999");
    await patch(one, `/proxies/${created.body.id}`, { apiKeyId: foreign.id }).expect(404);
    const row = await prisma.proxy.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.apiKeyId).toBe(keyId);
  });

  it("POST /proxies with no apiKeyId gives 400 invalid_proxy", async () => {
    const res = await post(one, "/proxies", proxyFields).expect(400);
    expect(res.body).toEqual({ error: "invalid_proxy", fields: ["apiKeyId"] });
  });

  describe("POST /proxies/models", () => {
    const listBody = { baseUrl: "https://openrouter.ai/api/v1", apiKey: KEY };
    const list = { status: 200, body: { data: [{ id: "z/last" }, { id: "a/first" }] } };

    it("with a URL and a key, gives the sorted ids and sends the key only in the Authorization header", async () => {
      fake.next(list);
      const res = await post(one, "/proxies/models", listBody).expect(200);
      expect(res.body).toEqual({ ok: true, models: ["a/first", "z/last"] });
      expect(res.text).not.toContain(KEY);
      expect(modelLists.calls.at(-1)?.url).toBe("https://openrouter.ai/api/v1/models");
      expect(fake.requests.at(-1)?.path).toBe("/v1/models");
      expect(fake.requests.at(-1)?.authorization).toBe(`Bearer ${KEY}`);
    });

    it("with apiKeyId and an empty key, uses the saved key, and another user gets 404", async () => {
      const body = { baseUrl: proxyBody.baseUrl, apiKey: "", apiKeyId: keyId };
      fake.next(list);
      const res = await post(one, "/proxies/models", body).expect(200);
      expect(res.body.ok).toBe(true);
      expect(modelLists.calls.at(-1)?.apiKey).toBe(KEY);
      const calls = modelLists.calls.length;
      await post(two, "/proxies/models", body).expect(404);
      await post(two, "/proxies/models", { ...body, apiKeyId: "not-a-uuid" }).expect(404);
      expect(modelLists.calls).toHaveLength(calls);
    });

    it("with apiKeyId, a saved key lists the models of a URL that no model uses yet", async () => {
      // A saved key is not bound to one URL, because many models on different URLs can use it.
      fake.next(list);
      const body = { baseUrl: "https://api.example.com/v1", apiKeyId: keyId };
      const res = await post(one, "/proxies/models", body).expect(200);
      expect(res.body.ok).toBe(true);
      expect(modelLists.calls.at(-1)).toMatchObject({ url: "https://api.example.com/v1/models", apiKey: KEY });
    });

    it("a 401 from the proxy gives invalid_key, and a 404 gives no_model_list", async () => {
      fake.next({ status: 401 }, { status: 404 });
      const refused = await post(one, "/proxies/models", listBody).expect(200);
      expect(refused.body).toEqual({ ok: false, error: "invalid_key", message: "The proxy refused the API key." });
      const missing = await post(one, "/proxies/models", listBody).expect(200);
      expect(missing.body).toEqual({
        ok: false,
        error: "no_model_list",
        message: "This proxy URL has no model list. Type the model id.",
      });
    });

    it("with Add /chat/completions off, gives no_model_list and sends no request", async () => {
      const calls = modelLists.calls.length;
      const res = await post(one, "/proxies/models", { ...listBody, appendPath: false }).expect(200);
      expect(res.body.error).toBe("no_model_list");
      expect(modelLists.calls).toHaveLength(calls);
    });

    it("a private address gives 400 blocked_url, and no key and no apiKeyId gives 400 invalid_proxy", async () => {
      const calls = modelLists.calls.length;
      const blocked = await post(one, "/proxies/models", { ...listBody, baseUrl: "https://10.0.0.5/v1" }).expect(400);
      expect(blocked.body.error).toBe("blocked_url");
      const empty = await post(one, "/proxies/models", { ...listBody, apiKey: "" }).expect(400);
      expect(empty.body).toEqual({ error: "invalid_proxy", fields: ["apiKey"] });
      expect(modelLists.calls).toHaveLength(calls);
    });

    it("the 11th request in one minute from one user gets 429", async () => {
      const codes: number[] = [];
      for (let n = 0; n < 11; n++) {
        codes.push((await post(one, "/proxies/models", { ...listBody, appendPath: false })).status);
      }
      expect(codes.slice(0, 10).every((code) => code === 200)).toBe(true);
      expect(codes[10]).toBe(429);
    });
  });
});
