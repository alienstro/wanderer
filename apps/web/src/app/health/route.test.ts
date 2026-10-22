import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET returns 200 and {"status":"ok"} with no fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
