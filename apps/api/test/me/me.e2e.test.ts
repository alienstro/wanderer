import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../../src/auth/session-cookie.js";
import { SessionService } from "../../src/auth/session.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestApp } from "../support/app.js";
import { WEB_ORIGIN } from "../support/env.js";

describe("handle step", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let sessions: SessionService;

  /** Makes a user with a session, and gives the Cookie header for that session. */
  async function userWithSession(n: number, handle: string | null = null): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `Tian.Lee${n}@example.com`, googleSub: `google-sub-${n}`, name: `Tian ${n}`, handle },
    });
    const { token } = await sessions.create(user.id);
    return `${SESSION_COOKIE}=${token}`;
  }

  function patchHandle(cookie: string, handle: string) {
    return request(app.getHttpServer())
      .patch("/me")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", cookie)
      .send({ handle });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /me with "Tian" saves "tian"', async () => {
    const cookie = await userWithSession(1);
    const res = await patchHandle(cookie, "Tian");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ handle: "tian", suggestedHandle: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { googleSub: "google-sub-1" } })).handle).toBe("tian");
  });

  it('PATCH /me with "ti an" returns 400', async () => {
    const cookie = await userWithSession(1);
    const res = await patchHandle(cookie, "ti an");
    expect(res.status).toBe(400);
  });

  it("GET /me for a user with no handle returns suggestedHandle from the email", async () => {
    const cookie = await userWithSession(1);
    const res = await request(app.getHttpServer()).get("/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ handle: null, suggestedHandle: "tian_lee1" });
  });

  it('Review Focus 4: PATCH /me with "TIAN" when "tian" exists returns 409', async () => {
    await userWithSession(1, "tian");
    const cookie = await userWithSession(2);
    const res = await patchHandle(cookie, "TIAN");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "handle_taken" });
  });

  it("Review Focus 4: two PATCH /me calls at the same time with the same handle give one 200 and one 409, not a 500", async () => {
    const first = await userWithSession(1);
    const second = await userWithSession(2);
    const results = await Promise.all([patchHandle(first, "tian"), patchHandle(second, "tian")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});
