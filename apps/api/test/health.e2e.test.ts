import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { testEnv, WEB_ORIGIN } from "./support/env.js";

describe("health, CORS, and env", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(testEnv());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failDatabase(): void {
    vi.spyOn(app.get(PrismaService), "$queryRaw").mockRejectedValue(new Error("connect ECONNREFUSED"));
  }

  it('GET /health returns 200 and {"status":"ok"}', async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it('GET /health/ready returns 200 and {"status":"ok"} when Postgres answers', async () => {
    const res = await request(app.getHttpServer()).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it('GET /health/ready returns 503 and only {"status":"unavailable"} when the database query fails', async () => {
    failDatabase();
    const res = await request(app.getHttpServer()).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
  });

  it("GET /health returns 200 when the database query fails", async () => {
    failDatabase();
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("a request from the web origin gets the CORS headers with credentials", async () => {
    const res = await request(app.getHttpServer()).get("/health").set("Origin", WEB_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("a request from https://evil.example gets no access-control-allow-origin header", async () => {
    const res = await request(app.getHttpServer()).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("loadEnv throws when COOKIE_SECRET is shorter than 32 characters", () => {
    const valid = testEnv();
    expect(() =>
      loadEnv({
        ...valid,
        ADMIN_EMAILS: "",
        PORT: "3001",
        KEY_ENCRYPTION_KEY: valid.KEY_ENCRYPTION_KEY.toString("base64"),
        COOKIE_SECRET: "too-short",
      }),
    ).toThrow(/COOKIE_SECRET/);
  });

  it("loadEnv keeps only the origin of WEB_ORIGIN, so a trailing slash does not break CORS", () => {
    expect(testEnv({ WEB_ORIGIN: "https://wanderer.alienstro.xyz/" }).WEB_ORIGIN).toBe(WEB_ORIGIN);
  });
});
