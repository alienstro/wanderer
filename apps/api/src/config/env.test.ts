import { describe, expect, it } from "vitest";
import { testEnv } from "../../test/support/env.js";

describe("loadEnv", () => {
  it("an empty OPENROUTER_API_KEY, as in the env example, means no key and the API starts", () => {
    expect(testEnv({ OPENROUTER_API_KEY: "" }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it("keeps a set OPENROUTER_API_KEY", () => {
    expect(testEnv({ OPENROUTER_API_KEY: "sk-or-1" }).OPENROUTER_API_KEY).toBe("sk-or-1");
  });
});
