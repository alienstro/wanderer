import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { shouldRetry } from "./query-provider";

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
