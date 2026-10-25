import { Body, Controller, Get, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../support/app.js";
import { WEB_ORIGIN } from "../support/env.js";

@Controller("__test")
class EchoController {
  @Post("echo")
  echo(@Body() body: unknown): unknown {
    return body;
  }

  @Get("echo")
  read(): { ok: true } {
    return { ok: true };
  }
}

describe("OriginGuard", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [EchoController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST with the web origin and a JSON body passes", async () => {
    const res = await request(app.getHttpServer())
      .post("/__test/echo")
      .set("Origin", WEB_ORIGIN)
      .send({ hello: "world" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ hello: "world" });
  });

  it("POST without an Origin header returns 403", async () => {
    const res = await request(app.getHttpServer()).post("/__test/echo").send({ hello: "world" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "origin_not_allowed" });
  });

  it("POST from https://other.alienstro.xyz returns 403", async () => {
    const res = await request(app.getHttpServer())
      .post("/__test/echo")
      .set("Origin", "https://other.alienstro.xyz")
      .send({ hello: "world" });
    expect(res.status).toBe(403);
  });

  it("POST with the web origin and text/plain returns 403", async () => {
    const res = await request(app.getHttpServer())
      .post("/__test/echo")
      .set("Origin", WEB_ORIGIN)
      .set("Content-Type", "text/plain")
      .send('{"hello":"world"}');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "json_required" });
  });

  it("GET without an Origin header passes", async () => {
    const res = await request(app.getHttpServer()).get("/__test/echo");
    expect(res.status).toBe(200);
  });
});
