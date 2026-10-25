import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuardedAiClientFactory, proxyEndpoint } from "../../src/ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../../src/ai/ai-errors.js";
import { type FakeAiServer, startFakeAiServer, UnguardedAiClientFactory } from "../support/fake-ai-server.js";

let fake: FakeAiServer;
const unguarded = new UnguardedAiClientFactory();

function target(endpoint = `${fake.url}/chat/completions`) {
  return { endpoint, apiKey: "sk-test-3f9a", model: "fake-model" };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("The call did not fail");
}

function ask(endpoint?: string) {
  return unguarded
    .create(target(endpoint))
    .chat.completions.create({ model: "fake-model", messages: [{ role: "user", content: "Hi" }] });
}

describe("the AI client", () => {
  beforeAll(async () => {
    fake = await startFakeAiServer();
  });

  afterAll(async () => {
    await fake.close();
  });

  it("a stream gives the pieces in order, and the request goes to the endpoint with the Bearer key", async () => {
    fake.next({ pieces: ["Hel", "lo", "!"] });
    const stream = await unguarded
      .create(target())
      .chat.completions.create({ model: "fake-model", stream: true, messages: [{ role: "user", content: "Hi" }] });
    const pieces: string[] = [];
    for await (const part of stream) {
      pieces.push(part.choices[0]?.delta.content ?? "");
    }
    expect(pieces.join("")).toBe("Hello!");
    const request = fake.requests.at(-1)!;
    expect(request.path).toBe("/v1/chat/completions");
    expect(request.authorization).toBe("Bearer sk-test-3f9a");
    expect(request.body.model).toBe("fake-model");
  });

  it("toAiError maps the provider status codes", async () => {
    const cases: Array<[number, unknown, string]> = [
      [401, undefined, "invalid_key"],
      [403, undefined, "invalid_key"],
      [404, undefined, "model_not_found"],
      [402, undefined, "no_credit"],
      [429, { error: { message: "quota", code: "insufficient_quota" } }, "no_credit"],
      [429, { type: "error", error: { type: "FreeUsageLimitError", message: "Limit reached." } }, "usage_limit"],
      [429, { error: { message: "[429]: Free usage limit reached. Subscribe to keep going." } }, "usage_limit"],
      [429, { error: { type: "rate_limit_error", message: "Too many requests." } }, "rate_limited"],
      [429, undefined, "rate_limited"],
      [500, undefined, "provider_error"],
    ];
    for (const [status, body, code] of cases) {
      fake.next({ status, body });
      expect(toAiError(await errorOf(ask())), String(status)).toBe(code);
    }
  });

  it("aiErrorLogFields keeps the provider error type, but not the key or the headers", async () => {
    fake.next({ status: 429, body: { type: "error", error: { type: "FreeUsageLimitError", message: "Limit." } } });
    const fields = aiErrorLogFields(await errorOf(ask()));
    expect(fields).toEqual({ status: 429, code: "usage_limit", providerCode: "FreeUsageLimitError" });

    fake.next({ status: 429, body: { error: { type: "x".repeat(500) } } });
    expect(aiErrorLogFields(await errorOf(ask())).providerCode).toHaveLength(100);

    fake.next({ status: 500, body: undefined });
    // The fake server sends { error: { type: "fake" } } when the test gives no body.
    expect(aiErrorLogFields(await errorOf(ask()))).toMatchObject({ status: 500, providerCode: "fake" });
  });

  it("toAiError maps a refused connection to provider_unreachable", async () => {
    const closed = await startFakeAiServer();
    await closed.close();
    expect(toAiError(await errorOf(ask(`${closed.url}/chat/completions`)))).toBe("provider_unreachable");
  });

  it("GuardedAiClientFactory refuses a private address, and the fake server gets no request", async () => {
    const count = fake.requests.length;
    const guarded = new GuardedAiClientFactory();
    expect(toAiError(await errorOf(Promise.resolve().then(() => guarded.create(target("https://127.0.0.1/v1")))))).toBe(
      "blocked_url",
    );
    // The host name passes the static check, but the DNS answer is a loopback address.
    const rebinding = new GuardedAiClientFactory(() => Promise.resolve([{ address: "127.0.0.1", family: 4 }]));
    const call = rebinding
      .create(target("https://api.example.com/v1/chat/completions"))
      .chat.completions.create({ model: "fake-model", messages: [{ role: "user", content: "Hi" }] });
    expect(toAiError(await errorOf(call))).toBe("blocked_url");
    expect(fake.requests.length).toBe(count);
  });

  it("proxyEndpoint adds /chat/completions only when appendPath is true", () => {
    expect(proxyEndpoint("https://api.example.com/v1", true)).toBe("https://api.example.com/v1/chat/completions");
    expect(proxyEndpoint("https://api.example.com/v1/chat", false)).toBe("https://api.example.com/v1/chat");
  });
});
