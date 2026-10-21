import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
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

  it('GET /health returns 200 and {"status":"ok"}', async () => {
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
      loadEnv({ ...valid, ADMIN_EMAILS: "", PORT: "3001", COOKIE_SECRET: "too-short" }),
    ).toThrow(/COOKIE_SECRET/);
  });
});
