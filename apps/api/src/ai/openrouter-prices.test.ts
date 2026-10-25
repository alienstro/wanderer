import { describe, expect, it } from "vitest";
import { ModelListError } from "./model-list.js";
import { FetchOpenRouterPricesClient, paidId, parsePrices } from "./openrouter-prices.js";

describe("paidId", () => {
  it("drops the :free ending", () => {
    expect(paidId("google/gemma-4-31b-it:free")).toBe("google/gemma-4-31b-it");
    expect(paidId("google/gemma-4-31b-it")).toBe("google/gemma-4-31b-it");
  });
});

describe("parsePrices", () => {
  it("reads the prompt and completion prices, which OpenRouter sends as strings", () => {
    const prices = parsePrices({
      data: [
        { id: "google/gemma-4-31b-it", pricing: { prompt: "0.0000002", completion: "0.0000004", request: "0" } },
        { id: "google/gemma-4-31b-it:free", pricing: { prompt: "0", completion: "0" } },
      ],
    });

    expect(prices.get("google/gemma-4-31b-it")).toEqual({ prompt: 0.0000002, completion: 0.0000004 });
    expect(prices.get("google/gemma-4-31b-it:free")).toEqual({ prompt: 0, completion: 0 });
  });

  it("drops an item with no numbers, and a negative price", () => {
    const prices = parsePrices({
      data: [
        { id: "a/no-pricing" },
        { id: "b/text", pricing: { prompt: "abc", completion: "1" } },
        { id: "c/negative", pricing: { prompt: "-1", completion: "0" } },
      ],
    });

    expect(prices.size).toBe(0);
  });

  it("throws no_model_list for a body with no data list", () => {
    expect(() => parsePrices({ models: [] })).toThrow(ModelListError);
  });
});

describe("FetchOpenRouterPricesClient", () => {
  it("reads the public list with no key, and a failed answer throws a ModelListError", async () => {
    const calls: Array<{ url: string; headers: unknown }> = [];
    const client = new FetchOpenRouterPricesClient(((url: string, init: { headers?: unknown }) => {
      calls.push({ url, headers: init.headers });
      return Promise.resolve(new Response("{}", { status: 503 }));
    }) as never);

    await expect(client.list()).rejects.toBeInstanceOf(ModelListError);
    expect(calls).toEqual([{ url: "https://openrouter.ai/api/v1/models", headers: { Accept: "application/json" } }]);
  });
});
