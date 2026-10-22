import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_OIDC, type GoogleOidc, type GoogleProfile } from "../src/auth/google-oidc.js";
import { SESSION_COOKIE } from "../src/auth/session-cookie.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { createTestApp } from "./support/app.js";
import { WEB_ORIGIN } from "./support/env.js";

const TERMS = "2026-10-21";
const CALLBACK = "https://wanderer-api.alienstro.xyz/auth/google/callback";

class FakeGoogleOidc implements GoogleOidc {
  profile: GoogleProfile = defaultProfile();

  async authorizationUrl(input: { state: string; codeVerifier: string; redirectUri: string }) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }

  async exchange(): Promise<GoogleProfile> {
    return this.profile;
  }
}

function defaultProfile(): GoogleProfile {
  return {
    sub: "google-sub-1",
    email: "tian@example.com",
    emailVerified: true,
    name: "Tian",
    picture: "https://lh3.googleusercontent.com/a/tian",
  };
}

let ipCounter = 0;
/** Each request gets its own client IP, so the login limit does not change other tests. */
function nextIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

function cookieFrom(setCookie: string[] | undefined, name: string): string | undefined {
  return setCookie?.find((c) => c.startsWith(`${name}=`));
}

describe("Google login", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const google = new FakeGoogleOidc();

  /** Runs /auth/google and gives the state and the OAuth cookie for the callback. */
  async function startLogin(): Promise<{ state: string; oauthCookie: string }> {
    const res = await request(app.getHttpServer())
      .get(`/auth/google?terms=${TERMS}`)
      .set("CF-Connecting-IP", nextIp());
    const location = new URL(res.headers.location as string);
    const oauthCookie = cookieFrom(res.headers["set-cookie"] as unknown as string[], "wanderer_oauth");
    return { state: location.searchParams.get("state") ?? "", oauthCookie: oauthCookie?.split(";")[0] ?? "" };
  }

  async function finishLogin(query: string, cookie?: string) {
    const req = request(app.getHttpServer())
      .get(`/auth/google/callback?${query}`)
      .set("CF-Connecting-IP", nextIp());
    return cookie ? req.set("Cookie", cookie) : req;
  }

  async function login() {
    const { state, oauthCookie } = await startLogin();
    return finishLogin(`code=good-code&state=${state}`, oauthCookie);
  }

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: GOOGLE_OIDC, useValue: google }] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    google.profile = defaultProfile();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it("/auth/google with the right terms version redirects to Google and sets wanderer_oauth", async () => {
    const res = await request(app.getHttpServer()).get(`/auth/google?terms=${TERMS}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
    const cookie = cookieFrom(res.headers["set-cookie"] as unknown as string[], "wanderer_oauth");
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("/auth/google with an old terms version redirects to /login?error=terms", async () => {
    const res = await request(app.getHttpServer()).get("/auth/google?terms=2025-01-01");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=terms`);
  });

  it("the callback with a matching state sets __Host-wanderer_session with HttpOnly, Secure, SameSite=Lax and no Domain", async () => {
    const res = await login();
    const cookie = cookieFrom(res.headers["set-cookie"] as unknown as string[], SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("the callback saves a TermsAcceptance with version 2026-10-21", async () => {
    await login();
    const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: "google-sub-1" } });
    const acceptances = await prisma.termsAcceptance.findMany({ where: { userId: user.id } });
    expect(acceptances.map((a) => a.version)).toEqual([TERMS]);
  });

  it("the callback for an ADMIN_EMAILS address gives role admin", async () => {
    google.profile = { ...defaultProfile(), email: "admin@example.com" };
    await login();
    const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: "google-sub-1" } });
    expect(user.role).toBe("admin");
  });

  it("a new user goes to /onboarding, and a user with a handle goes to /", async () => {
    const first = await login();
    expect(first.headers.location).toBe(`${WEB_ORIGIN}/onboarding`);

    await prisma.user.update({ where: { googleSub: "google-sub-1" }, data: { handle: "tian" } });
    const second = await login();
    expect(second.headers.location).toBe(`${WEB_ORIGIN}/`);
  });

  it("Review Focus 1: the callback with error=access_denied redirects to /login?error=cancelled", async () => {
    const { state, oauthCookie } = await startLogin();
    const res = await finishLogin(`error=access_denied&state=${state}`, oauthCookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=cancelled`);
    expect(cookieFrom(res.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)).toBeUndefined();
  });

  it("Review Focus 2: the callback with a wrong state or no wanderer_oauth cookie returns 400 and sets no session", async () => {
    const { oauthCookie } = await startLogin();
    const wrongState = await finishLogin("code=good-code&state=wrong", oauthCookie);
    expect(wrongState.status).toBe(400);
    // The browser shows this page, so it is HTML with a way back to the login page.
    expect(wrongState.headers["content-type"]).toMatch(/text\/html/);
    expect(wrongState.text).toContain(`href="${WEB_ORIGIN}/login"`);
    expect(cookieFrom(wrongState.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)).toBeUndefined();

    const { state } = await startLogin();
    const noCookie = await finishLogin(`code=good-code&state=${state}`);
    expect(noCookie.status).toBe(400);
    expect(cookieFrom(noCookie.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("Review Focus 3: the callback for a banned user redirects to /login?error=banned and sets no session", async () => {
    await prisma.user.create({
      data: { email: "tian@example.com", googleSub: "google-sub-1", name: "Tian", bannedAt: new Date() },
    });
    const res = await login();
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=banned`);
    expect(cookieFrom(res.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("a Google account whose email belongs to another user goes to /login?error=account, not a 500", async () => {
    await prisma.user.create({ data: { email: "tian@example.com", googleSub: "old-google-sub", name: "Old Tian" } });
    const res = await login();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=account`);
    expect(await prisma.session.count()).toBe(0);
  });

  it("an email that Google did not verify goes to /login?error=email", async () => {
    google.profile = { ...defaultProfile(), emailVerified: false };
    const res = await login();
    expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=email`);
    expect(await prisma.session.count()).toBe(0);
  });

  it("Review Focus 5: a request with X-Forwarded-Proto https still gets a Secure cookie, and the Google URL has an https redirect_uri", async () => {
    const start = await request(app.getHttpServer())
      .get(`/auth/google?terms=${TERMS}`)
      .set("X-Forwarded-Proto", "https")
      .set("Host", "wanderer-api.alienstro.xyz");
    const location = new URL(start.headers.location as string);
    expect(location.searchParams.get("redirect_uri")).toBe(CALLBACK);

    const oauthCookie = cookieFrom(start.headers["set-cookie"] as unknown as string[], "wanderer_oauth");
    const res = await request(app.getHttpServer())
      .get(`/auth/google/callback?code=good-code&state=${location.searchParams.get("state")}`)
      .set("X-Forwarded-Proto", "https")
      .set("Cookie", oauthCookie?.split(";")[0] ?? "");
    expect(cookieFrom(res.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)).toMatch(/Secure/);
  });

  it("GET /me without a cookie returns 401", async () => {
    const res = await request(app.getHttpServer()).get("/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("POST /auth/logout ends the session", async () => {
    const loginRes = await login();
    const session = cookieFrom(loginRes.headers["set-cookie"] as unknown as string[], SESSION_COOKIE)?.split(";")[0] ?? "";

    const me = await request(app.getHttpServer()).get("/me").set("Cookie", session);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: "tian@example.com", handle: null, role: "user" });

    const logout = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", session);
    expect(logout.status).toBe(204);

    const after = await request(app.getHttpServer()).get("/me").set("Cookie", session);
    expect(after.status).toBe(401);
  });
});

describe("login rate limit", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: GOOGLE_OIDC, useValue: new FakeGoogleOidc() }] });
  });

  afterAll(async () => {
    await app.close();
  });

  it("the 11th GET /auth/google in one minute from one client IP returns 429, and another IP still gets 302", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app.getHttpServer())
        .get(`/auth/google?terms=${TERMS}`)
        .set("CF-Connecting-IP", "203.0.113.50");
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 302)).toBe(true);
    expect(statuses[10]).toBe(429);

    const other = await request(app.getHttpServer())
      .get(`/auth/google?terms=${TERMS}`)
      .set("CF-Connecting-IP", "203.0.113.51");
    expect(other.status).toBe(302);
  });
});
