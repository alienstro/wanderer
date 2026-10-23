import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { createQueryClient, shouldRetry } from "./query-provider";
import { SIGNED_IN_HINT_COOKIE } from "./signed-in-hint";

describe("shouldRetry", () => {
  it("does not retry a 4xx answer, because the same request gets the same answer", () => {
    expect(shouldRetry(0, new ApiError(403, "adult_content"))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, "not_found"))).toBe(false);
  });

  it("retries a network error or a 5xx answer two times", () => {
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, null))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, null))).toBe(false);
  });
});

describe("the signed-in hint cookie", () => {
  afterEach(() => {
    document.cookie = `${SIGNED_IN_HINT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("is set when the me query gets a user, and cleared when it gets null, also after setQueryData", () => {
    const client = createQueryClient();
    client.setQueryData(["me"], { id: "u1", handle: "tian" });
    expect(document.cookie).toContain(`${SIGNED_IN_HINT_COOKIE}=1`);

    client.setQueryData(["me"], null);
    expect(document.cookie).not.toContain(SIGNED_IN_HINT_COOKIE);
  });

  it("does not change for another query", () => {
    const client = createQueryClient();
    client.setQueryData(["chats"], []);
    expect(document.cookie).not.toContain(SIGNED_IN_HINT_COOKIE);
  });
});
