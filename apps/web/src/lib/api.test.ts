import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

function fakeFetch(response: Response) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://wanderer-api.alienstro.xyz");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("a FormData body gets no JSON Content-Type, so the browser sets the multipart boundary", async () => {
    const fetchMock = fakeFetch(Response.json({ ok: true }));
    const body = new FormData();
    body.append("file", new Blob(["x"]), "a.png");
    await apiFetch("/files", { method: "POST", body });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("Content-Type")).toBe(false);
  });

  it("sends credentials include", async () => {
    const fetchMock = fakeFetch(Response.json({ ok: true }));
    await apiFetch("/me");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://wanderer-api.alienstro.xyz/me");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("with a body sends Content-Type application/json", async () => {
    const fetchMock = fakeFetch(Response.json({ ok: true }));
    await apiFetch("/me", { method: "PATCH", body: JSON.stringify({ handle: "tian" }) });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws ApiError with status 409 and code handle_taken", async () => {
    fakeFetch(Response.json({ error: "handle_taken" }, { status: 409 }));
    const error = await apiFetch("/me", { method: "PATCH", body: "{}" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "handle_taken" });
  });

  it("returns undefined for 204", async () => {
    fakeFetch(new Response(null, { status: 204 }));
    expect(await apiFetch("/auth/logout", { method: "POST" })).toBeUndefined();
  });
});
