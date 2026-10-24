import { PROXY_MODEL_MAX, PROXY_MODELS_LIMIT } from "@wanderer/shared";
import type { fetch as undiciFetch } from "undici";
import { describe, expect, it, vi } from "vitest";
import { fetchModelIds, MODEL_LIST_MAX_BYTES, modelIds, ModelListError } from "./model-list.js";
import { BlockedUrlError } from "./url-guard.js";

const URL = "https://proxy.example.com/v1/models";

/** A fetch that gives one answer and keeps the init of the call. */
function answer(response: Response | Error) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  return { fetch, transport: { fetch: fetch as unknown as typeof undiciFetch } };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ModelListError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("The call did not fail");
}

describe("modelIds", () => {
  it("keeps the id strings, sorted, with no duplicates", () => {
    const body = { data: [{ id: "b/two" }, { id: "a/one", name: "One" }, { id: "b/two" }, { id: 3 }, {}, null] };
    expect(modelIds(body)).toEqual(["a/one", "b/two"]);
  });

  it("drops an empty id and an id longer than PROXY_MODEL_MAX", () => {
    const body = { data: [{ id: "  " }, { id: "x".repeat(PROXY_MODEL_MAX + 1) }, { id: "ok" }] };
    expect(modelIds(body)).toEqual(["ok"]);
  });

  it("gives no more than PROXY_MODELS_LIMIT ids", () => {
    const data = Array.from({ length: PROXY_MODELS_LIMIT + 5 }, (_, n) => ({ id: `m${String(n).padStart(5, "0")}` }));
    expect(modelIds({ data })).toHaveLength(PROXY_MODELS_LIMIT);
  });

  it("throws no_model_list for a body with no data array", () => {
    for (const body of [null, "text", { data: "x" }, { models: [] }]) {
      expect(() => modelIds(body)).toThrow(ModelListError);
    }
  });
});

describe("fetchModelIds", () => {
  it("sends a GET with the key in the Authorization header and gives the ids", async () => {
    const { fetch, transport } = answer(Response.json({ data: [{ id: "m1" }] }));
    expect(await fetchModelIds(URL, "sk-secret", transport)).toEqual(["m1"]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-secret");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps 401 to invalid_key, 404 to no_model_list, 429 to rate_limited, and 500 to provider_error", async () => {
    const cases: Array<[number, string]> = [
      [401, "invalid_key"],
      [403, "invalid_key"],
      [404, "no_model_list"],
      [405, "no_model_list"],
      [429, "rate_limited"],
      [500, "provider_error"],
    ];
    for (const [status, code] of cases) {
      expect(await codeOf(fetchModelIds(URL, "k", answer(new Response("{}", { status })).transport))).toBe(code);
    }
  });

  it("gives no_model_list for an answer that is not JSON", async () => {
    expect(await codeOf(fetchModelIds(URL, "k", answer(new Response("<html>")).transport))).toBe("no_model_list");
  });

  it("gives no_model_list for an answer larger than MODEL_LIST_MAX_BYTES", async () => {
    const big = new Response(`{"data":[{"id":"${"x".repeat(MODEL_LIST_MAX_BYTES)}"}]}`);
    expect(await codeOf(fetchModelIds(URL, "k", answer(big).transport))).toBe("no_model_list");
  });

  it("maps a blocked address to blocked_url, a timeout to timeout, and a network error to provider_unreachable", async () => {
    const blocked = new TypeError("fetch failed", { cause: new BlockedUrlError() });
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const network = new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") });
    expect(await codeOf(fetchModelIds(URL, "k", answer(blocked).transport))).toBe("blocked_url");
    expect(await codeOf(fetchModelIds(URL, "k", answer(timeout).transport))).toBe("timeout");
    expect(await codeOf(fetchModelIds(URL, "k", answer(network).transport))).toBe("provider_unreachable");
  });
});
