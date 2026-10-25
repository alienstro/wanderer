import type { NestExpressApplication } from "@nestjs/platform-express";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_CLIENT_FACTORY } from "../../src/ai/ai-client.js";
import { FILE_STORAGE } from "../../src/files/file-storage.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import {
  SCENE_IMAGE_CLIENT,
  type SceneImageClient,
  SceneImageError,
  type SceneImageRequest,
} from "../../src/scenes/runpod-client.js";
import { createTestApp } from "../support/app.js";
import { createCharacter } from "../support/characters.js";
import { addProxy, startChat } from "../support/chat-stream.js";
import { WEB_ORIGIN } from "../support/env.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "../support/fake-ai-server.js";
import { resetEnergySettings } from "../support/free-models.js";
import { pngImage } from "../support/images.js";
import { MemoryStorage } from "../support/memory-storage.js";
import { type TestUser, userWithSession } from "../support/users.js";

/** A fake RunPod client. Each call takes the next answer: an image, an error, or a promise that a test ends. */
class FakeSceneClient implements SceneImageClient {
  readonly requests: SceneImageRequest[] = [];
  private readonly answers: Array<() => Promise<Buffer>> = [];

  next(answer: () => Promise<Buffer>): void {
    this.answers.push(answer);
  }

  generate(request: SceneImageRequest): Promise<Buffer> {
    this.requests.push(request);
    return (this.answers.shift() ?? (() => pngImage(1024, 1024)))();
  }
}

describe("scene images", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fake: FakeAiServer;
  const images = new FakeSceneClient();
  const storage = new MemoryStorage();
  let user: TestUser;
  let chatId: string;

  const generate = (owner = user, id = chatId) =>
    request(app.getHttpServer()).post(`/chats/${id}/scenes`).set("Origin", WEB_ORIGIN).set("Cookie", owner.cookie);

  beforeAll(async () => {
    fake = await startFakeAiServer();
    app = await createTestApp({
      overrides: [
        { token: AI_CLIENT_FACTORY, useValue: new UnguardedAiClientFactory(fake.url) },
        { token: SCENE_IMAGE_CLIENT, useValue: images },
        { token: FILE_STORAGE, useValue: storage },
      ],
    });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await resetEnergySettings(prisma);
    images.requests.length = 0;
    user = await userWithSession(app, 1);
    chatId = await startChat(app, user, await createCharacter(app, user.cookie));
    await addProxy(app, user);
  });

  afterAll(async () => {
    await resetEnergySettings(prisma);
    await app.close();
    await fake.close();
  });

  it("makes a 1024 × 1024 image from a prompt of the model, and the chat keeps it after a reload", async () => {
    fake.next({ pieces: ['Prompt: "A misty forest at dawn."'] });
    const res = await generate().expect(201);
    expect(res.body).toMatchObject({ afterPosition: 0, url: expect.stringMatching(/^\/files\/[0-9a-f-]{36}$/) });
    expect(images.requests).toEqual([
      {
        model: "flux-schnell",
        prompt: expect.stringContaining("A misty forest at dawn."),
        negativePrompt: expect.stringContaining("nudity"),
        adult: false,
      },
    ]);
    expect(fake.requests.at(-1)!.body.messages?.at(-1)?.content).toContain("Describe the current scene");

    const file = await request(app.getHttpServer()).get(res.body.url).set("Cookie", user.cookie).expect(200);
    const meta = await sharp(file.body as Buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1024, 1024]);

    const detail = await request(app.getHttpServer()).get(`/chats/${chatId}`).set("Cookie", user.cookie).expect(200);
    expect(detail.body.scenes).toEqual([res.body]);
  });

  it("a scene image shows only to the owner of the chat, and no shared cache keeps it", async () => {
    fake.next({ pieces: ["A forest."] });
    const { url } = (await generate().expect(201)).body as { url: string };
    const owner = await request(app.getHttpServer()).get(url).set("Cookie", user.cookie).expect(200);
    expect(owner.headers["cache-control"]).toBe("private, no-store");
    await request(app.getHttpServer()).get(url).expect(404);
    const other = await userWithSession(app, 2);
    await request(app.getHttpServer()).get(url).set("Cookie", other.cookie).expect(404);
  });

  it("a RunPod failure gives 502 scene_failed and saves no image, and the user can try again", async () => {
    fake.next({ pieces: ["A forest."] }, { pieces: ["A forest."] });
    images.next(() => Promise.reject(new SceneImageError("scene_failed", "The RunPod job ended with FAILED")));
    expect((await generate().expect(502)).body).toEqual({ error: "scene_failed" });
    expect(await prisma.sceneImage.count()).toBe(0);
    await generate().expect(201);
  });

  it("a RunPod job that passes the time limit gives 504 scene_timeout", async () => {
    fake.next({ pieces: ["A forest."] });
    images.next(() => Promise.reject(new SceneImageError("scene_timeout", "The RunPod job passed the time limit")));
    expect((await generate().expect(504)).body).toEqual({ error: "scene_timeout" });
  });

  it("a second request while a job runs gives 409 scene_busy and starts no second job", async () => {
    fake.next({ pieces: ["A forest."] }, { pieces: ["A forest."] });
    let finish!: (image: Buffer) => void;
    images.next(() => new Promise((resolve) => (finish = resolve)));
    const first = generate().then((res) => res);
    for (let wait = 0; images.requests.length === 0 && wait < 200; wait++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await generate().expect(409)).body).toEqual({ error: "scene_busy" });
    finish(await pngImage(1024, 1024));
    expect((await first).status).toBe(201);
    expect(images.requests).toHaveLength(1);
  });

  it("a scene takes 0.3 energy from a user with an own text model", async () => {
    fake.next({ pieces: ["A forest."] });
    await generate().expect(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } })).energy).toBe(2000 - 30);
    expect(await prisma.energyEntry.findMany({ where: { reason: "scene" } })).toMatchObject([{ amount: -30, chatId }]);
  });

  it("a failed image gives the energy back", async () => {
    fake.next({ pieces: ["A forest."] });
    images.next(() => Promise.reject(new SceneImageError("scene_failed", "The RunPod job ended with FAILED")));
    await generate().expect(502);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } })).energy).toBe(2000);
  });

  it("a user with too little energy gets 429 energy_low and no job", async () => {
    await prisma.user.update({ where: { id: user.user.id }, data: { energy: 29, energyRefilledAt: new Date() } });
    expect((await generate().expect(429)).body).toEqual({
      error: "energy_low",
      balance: 0.29,
      price: 0.3,
      nextRefillAt: expect.any(String),
    });
    expect(images.requests).toHaveLength(0);
  });

  it("the scene model of the settings makes the image, at its own price", async () => {
    await prisma.energySettings.update({ where: { id: 1 }, data: { sceneModelKey: "z-image-turbo" } });
    fake.next({ pieces: ["A forest."] });
    await generate().expect(201);
    expect(images.requests.map((sent) => sent.model)).toEqual(["z-image-turbo"]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } })).energy).toBe(2000 - 50);
  });

  it("the chat of another user gives 404", async () => {
    const other = await userWithSession(app, 2);
    expect((await generate(other).expect(404)).body).toEqual({ error: "not_found" });
    expect(images.requests).toHaveLength(0);
  });

  it("a deleted chat removes its images, and the scene rows stay", async () => {
    fake.next({ pieces: ["A forest."] });
    const scene = (await generate().expect(201)).body as { url: string };
    await request(app.getHttpServer()).delete(`/chats/${chatId}`).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).expect(204);
    await request(app.getHttpServer()).get(scene.url).set("Cookie", user.cookie).expect(404);
    expect(await prisma.file.count({ where: { ownerId: user.user.id } })).toBe(0);
    expect(await prisma.sceneImage.count({ where: { userId: user.user.id } })).toBe(1);
  });
});
