import { describe, expect, it } from "vitest";
import { createChatSchema, messageInputSchema } from "./chats.js";
import { AI_ERROR_CODES, AI_ERROR_TEXT, proxyCreateSchema, proxyUpdateSchema } from "./proxies.js";

const proxy = {
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1/",
  model: "deepseek/deepseek-chat",
  apiKeyId: "0b6f3c2e-1d7a-4f6e-8a51-3c9d2e7f4a10",
};

describe("proxyCreateSchema", () => {
  it("accepts a minimal https proxy and trims the trailing slash", () => {
    const parsed = proxyCreateSchema.parse(proxy);
    expect(parsed.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(parsed.appendPath).toBe(true);
    expect(parsed.customPrompt).toBe("");
    expect(parsed.contextTokens).toBe(16_000);
  });

  it("accepts a context size of 2,000 and 200,000, and rejects 1,999, 200,001 and 2,500.5", () => {
    for (const contextTokens of [2_000, 200_000]) {
      expect(proxyCreateSchema.safeParse({ ...proxy, contextTokens }).success).toBe(true);
    }
    for (const contextTokens of [1_999, 200_001, 2_500.5]) {
      expect(proxyCreateSchema.safeParse({ ...proxy, contextTokens }).success).toBe(false);
    }
  });

  it("rejects http, a user:pass URL, a URL with #, a 501-character URL, and a key ID that is not a UUID", () => {
    const bad = [
      { ...proxy, baseUrl: "http://openrouter.ai/api/v1" },
      { ...proxy, baseUrl: "https://user:pass@openrouter.ai/api/v1" },
      { ...proxy, baseUrl: "https://openrouter.ai/api/v1#x" },
      { ...proxy, baseUrl: `https://openrouter.ai/${"a".repeat(480)}` },
      { ...proxy, apiKeyId: "not-a-uuid" },
    ];
    for (const body of bad) {
      expect(proxyCreateSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("proxyUpdateSchema", () => {
  it("accepts an empty object", () => {
    expect(proxyUpdateSchema.parse({})).toEqual({});
  });

  it("rejects a context size of 1,999", () => {
    expect(proxyUpdateSchema.safeParse({ contextTokens: 1_999 }).success).toBe(false);
    expect(proxyUpdateSchema.parse({ contextTokens: 32_000 })).toEqual({ contextTokens: 32_000 });
  });
});

describe("messageInputSchema", () => {
  it('rejects "   " and an 8,001-character message', () => {
    expect(messageInputSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(messageInputSchema.safeParse({ content: "a".repeat(8001) }).success).toBe(false);
    expect(messageInputSchema.parse({ content: " hi " }).content).toBe("hi");
  });
});

describe("createChatSchema", () => {
  it("rejects openingIndex 10", () => {
    const characterId = "6f0c1b8e-7a4d-4c2a-9a39-2a8f2f4b9d10";
    expect(createChatSchema.safeParse({ characterId, openingIndex: 10 }).success).toBe(false);
    expect(createChatSchema.safeParse({ characterId, openingIndex: 9 }).success).toBe(true);
  });
});

describe("AI_ERROR_TEXT", () => {
  it("has a text for each code", () => {
    for (const code of AI_ERROR_CODES) {
      expect(AI_ERROR_TEXT[code].length).toBeGreaterThan(0);
    }
  });
});
