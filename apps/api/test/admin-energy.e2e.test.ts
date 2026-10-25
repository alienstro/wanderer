import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../src/ai/ai-client.js";
import { ModelListError } from "../src/ai/model-list.js";
import { type ModelPrice, OPENROUTER_PRICES_CLIENT, type OpenRouterPricesClient } from "../src/ai/openrouter-prices.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { testEnv, WEB_ORIGIN } from "./support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "./support/fake-ai-server.js";
import { resetEnergySettings, SERVER_KEY } from "./support/free-models.js";
import { type TestUser, userWithSession } from "./support/users.js";

/** A fake OpenRouter list. A test sets the prices, or an error. */
class FakePrices implements OpenRouterPricesClient {
  answer: Map<string, ModelPrice> | Error = new Map();

  list(): Promise<Map<string, ModelPrice>> {
    return this.answer instanceof Error ? Promise.reject(this.answer) : Promise.resolve(this.answer);
  }
}

const GEMMA = "google/gemma-4-31b-it:free";
const SETTINGS = {
  dailyEnergy: 20,
  choicesPrice: 0,
  memoryPrice: 1,
  sceneModelKey: "flux-schnell",
  textMarkupPercent: 0,
  imageMarkupPercent: 0,
  freeDailyCap: 950,
};

describe("admin energy and models", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  const prices = new FakePrices();
  let admin: TestUser;

  const send = (method: "get" | "put" | "post" | "patch" | "delete", path: string, body?: object, as = admin) => {
    const req = request(app.getHttpServer())[method](`/admin/energy${path}`).set("Origin", WEB_ORIGIN).set("Cookie", as.cookie);
    return body ? req.send(body) : req;
  };
  const addGemma = (body: object = {}) => send("post", "/free-models", { openrouterId: GEMMA, displayName: "Gemma", ...body });

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      env: testEnv({ OPENROUTER_API_KEY: SERVER_KEY }),
      overrides: [
        { token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) },
        { token: OPENROUTER_PRICES_CLIENT, useValue: prices },
      ],
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.freeModel.deleteMany();
    await prisma.appEvent.deleteMany();
    await resetEnergySettings(prisma);
    await prisma.sceneModel.updateMany({ data: { markupPercent: null, enabled: true } });
    await prisma.sceneModel.update({ where: { key: "flux-schnell" }, data: { costUsd: "0.003" } });
    prices.answer = new Map([["google/gemma-4-31b-it", { prompt: 0.0000002, completion: 0.0000004 }]]);
    admin = await userWithSession(app, 1, { role: "admin" });
  });

  afterAll(async () => {
    await prisma.freeModel.deleteMany();
    await resetEnergySettings(prisma);
    await app.close();
    await fake.close();
  });

  it("a user who is not an admin gets 403 from each endpoint", async () => {
    const user = await userWithSession(app, 2);

    await send("get", "", undefined, user).expect(403);
    await send("put", "/settings", SETTINGS, user).expect(403);
    await send("post", "/free-models", { openrouterId: GEMMA, displayName: "Gemma" }, user).expect(403);
    await send("post", "/prices/refresh", {}, user).expect(403);
  });

  it("gives the settings and the scene price table: Flux Schnell at $0.003 with 0% is 0.3 energy", async () => {
    const res = await send("get", "").expect(200);

    expect(res.body.settings).toMatchObject({ ...SETTINGS });
    expect(res.body.sceneModels).toEqual([
      expect.objectContaining({ key: "flux-schnell", costUsd: 0.003, markupPercent: 0, energyPrice: 0.3, usdValue: 0.003, active: true }),
      expect.objectContaining({ key: "z-image-turbo", costUsd: 0.005, energyPrice: 0.5, active: false }),
    ]);
  });

  it("an image markup of 50% gives the Flux Schnell scene a price of 0.45", async () => {
    await send("put", "/settings", { ...SETTINGS, imageMarkupPercent: 50 }).expect(200);

    const res = await send("get", "").expect(200);

    expect(res.body.sceneModels[0]).toMatchObject({ key: "flux-schnell", energyPrice: 0.45 });
  });

  it("adding gemma reads the prices of its paid version and the time of the read", async () => {
    const res = await addGemma().expect(201);

    expect(res.body).toMatchObject({
      openrouterId: GEMMA,
      promptPriceUsd: 0.0000002,
      completionPriceUsd: 0.0000004,
      pricesFetchedAt: expect.any(String),
      energyPrice: 0.34,
    });
  });

  it("a text markup of 50% gives gemma a price of 0.51", async () => {
    await addGemma().expect(201);
    await send("put", "/settings", { ...SETTINGS, textMarkupPercent: 50 }).expect(200);

    const res = await send("get", "").expect(200);

    expect(res.body.freeModels[0]).toMatchObject({ costUsd: 0.00336, markupPercent: 50, energyPrice: 0.51, usdValue: 0.0051 });
  });

  it("a model markup of 100% wins over the text default, and a cleared markup uses the default again", async () => {
    const { id } = (await addGemma().expect(201)).body as { id: string };

    expect((await send("patch", `/free-models/${id}`, { markupPercent: 100 }).expect(200)).body).toMatchObject({
      ownMarkupPercent: 100,
      markupPercent: 100,
      energyPrice: 0.68,
    });
    expect((await send("patch", `/free-models/${id}`, { markupPercent: null }).expect(200)).body).toMatchObject({
      ownMarkupPercent: null,
      markupPercent: 0,
      energyPrice: 0.34,
    });
  });

  it("a model with no paid version cannot be enabled until the admin types a manual price", async () => {
    const body = { openrouterId: "recursive/flint-v1.0:free", displayName: "Flint", enabled: true };

    expect((await send("post", "/free-models", body).expect(400)).body).toEqual({ error: "price_required" });
    const res = await send("post", "/free-models", { ...body, manualEnergyPrice: 0.5 }).expect(201);
    expect(res.body).toMatchObject({ promptPriceUsd: null, energyPrice: 0.5, enabled: true });
  });

  it("a failed price refresh gives 502 and keeps the last prices", async () => {
    await addGemma().expect(201);
    prices.answer = new ModelListError("provider_unreachable");

    expect((await send("post", "/prices/refresh", {}).expect(502)).body).toEqual({ error: "price_refresh_failed" });

    expect((await send("get", "").expect(200)).body.freeModels[0]).toMatchObject({ promptPriceUsd: 0.0000002 });
  });

  it("a refresh reads the new prices", async () => {
    await addGemma().expect(201);
    prices.answer = new Map([["google/gemma-4-31b-it", { prompt: 0.0000004, completion: 0.0000004 }]]);

    const res = await send("post", "/prices/refresh", {}).expect(200);

    expect(res.body.freeModels[0]).toMatchObject({ promptPriceUsd: 0.0000004 });
  });

  it("refuses a price with 3 decimal places, a price below 0, a daily amount below 0 and an empty model id", async () => {
    await send("put", "/settings", { ...SETTINGS, choicesPrice: 0.555 }).expect(400);
    await send("put", "/settings", { ...SETTINGS, memoryPrice: -1 }).expect(400);
    await send("put", "/settings", { ...SETTINGS, dailyEnergy: -1 }).expect(400);
    const res = await send("post", "/free-models", { openrouterId: " ", displayName: "Empty" }).expect(400);
    expect(res.body).toEqual({ error: "invalid_energy", fields: ["openrouterId"] });
  });

  it("one model is the default: a new default replaces the old one", async () => {
    const first = (await addGemma({ isDefault: true }).expect(201)).body as { id: string };
    await send("post", "/free-models", { openrouterId: "meta/llama:free", displayName: "Llama", isDefault: true, manualEnergyPrice: 1 }).expect(201);

    const res = await send("get", "").expect(200);

    expect(res.body.freeModels.filter((model: { isDefault: boolean }) => model.isDefault).map((model: { id: string }) => model.id)).not.toContain(first.id);
  });

  it("Test sends one short call with the server key to the model", async () => {
    fake.next({ pieces: ["OK"] });

    const res = await send("post", "/free-models/test", { openrouterId: GEMMA }).expect(200);

    expect(res.body).toMatchObject({ ok: true, reply: "OK" });
    expect(fake.requests.at(-1)).toMatchObject({ authorization: `Bearer ${SERVER_KEY}`, body: { model: GEMMA } });
  });

  it("the scene model cannot be a model that is off, and the active model cannot turn off", async () => {
    await send("put", "/scene-models/z-image-turbo", { costUsd: 0.005, markupPercent: null, enabled: false }).expect(200);
    expect((await send("put", "/settings", { ...SETTINGS, sceneModelKey: "z-image-turbo" }).expect(400)).body).toEqual({
      error: "scene_model_off",
    });
    expect(
      (await send("put", "/scene-models/flux-schnell", { costUsd: 0.003, markupPercent: null, enabled: false }).expect(409)).body,
    ).toEqual({ error: "scene_model_active" });
    await send("put", "/scene-models/unknown", { costUsd: 0.003, markupPercent: null, enabled: true }).expect(404);
  });

  it("each change records an admin_change event with the admin, the old value and the new value", async () => {
    await send("put", "/settings", { ...SETTINGS, dailyEnergy: 25 }).expect(200);

    const events = await prisma.appEvent.findMany({ where: { type: "admin_change" } });
    expect(events).toMatchObject([
      {
        userId: admin.user.id,
        reason: "settings",
        details: { old: expect.objectContaining({ dailyEnergy: 20 }), new: expect.objectContaining({ dailyEnergy: 25 }) },
      },
    ]);
  });

  it("no answer holds the server key", async () => {
    await addGemma().expect(201);

    const res = await send("get", "").expect(200);

    expect(JSON.stringify(res.body)).not.toContain(SERVER_KEY);
  });
});
