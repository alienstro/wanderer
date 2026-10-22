import { describe, expect, it } from "vitest";
import { serializeRequest } from "./logging.js";

describe("serializeRequest", () => {
  it("removes the query, so the log has no OAuth code or state", () => {
    const logged = serializeRequest({
      id: 1,
      method: "GET",
      url: "/auth/google/callback?code=4%2F0secret&state=abc",
      query: { code: "4/0secret", state: "abc" },
      headers: { "user-agent": "test" },
    });
    expect(JSON.stringify(logged)).not.toContain("secret");
    expect(logged.url).toBe("/auth/google/callback");
  });
});
