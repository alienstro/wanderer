import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fetch as undiciFetch } from "undici";
import { type AiClientFactory, type AiTarget, createOpenAiClient } from "../../src/ai/ai-client.js";
import { fetchModelIds, type ModelListClient } from "../../src/ai/model-list.js";

/** What the fake server does for one request. */
export type FakeBehavior =
  | { pieces: string[]; delayMs?: number; firstDelayMs?: number }
  | { status: number; body?: unknown };

export interface FakeRequest {
  path: string;
  authorization: string | undefined;
  body: { model?: string; stream?: boolean; messages?: Array<{ role: string; content: string }>; max_tokens?: number };
}

export interface FakeAiServer {
  /** The base URL, such as http://127.0.0.1:1234/v1. */
  url: string;
  requests: FakeRequest[];
  /** Puts behaviors in a queue, one for each next request. An empty queue answers "OK". */
  next(...behaviors: FakeBehavior[]): void;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(content: string): string {
  const body = {
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

function completion(content: string) {
  return {
    id: "chatcmpl-fake",
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

async function readJson(req: IncomingMessage): Promise<FakeRequest["body"]> {
  const parts: Buffer[] = [];
  for await (const part of req) {
    parts.push(part as Buffer);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8") || "{}") as FakeRequest["body"];
}

async function answer(behavior: FakeBehavior, body: FakeRequest["body"], res: ServerResponse): Promise<void> {
  if ("status" in behavior) {
    res.writeHead(behavior.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(behavior.body ?? { error: { message: "fake error", type: "fake" } }));
    return;
  }
  if (!body.stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(completion(behavior.pieces.join(""))));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.flushHeaders();
  let first = true;
  for (const piece of behavior.pieces) {
    await sleep(first ? (behavior.firstDelayMs ?? 0) : (behavior.delayMs ?? 0));
    first = false;
    if (res.destroyed) {
      return;
    }
    res.write(chunk(piece));
  }
  res.end("data: [DONE]\n\n");
}

/** An http server on 127.0.0.1 that speaks the OpenAI chat completions format. */
export async function startFakeAiServer(): Promise<FakeAiServer> {
  const queue: FakeBehavior[] = [];
  const requests: FakeRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const body = await readJson(req);
      requests.push({ path: req.url ?? "", authorization: req.headers.authorization, body });
      await answer(queue.shift() ?? { pieces: ["OK"] }, body, res);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    next: (...behaviors) => queue.push(...behaviors),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/**
 * The AI client factory with no SSRF guard, so e2e tests can reach the fake server. Use it only in tests.
 * With `sendTo`, each call goes to that URL, so a saved https proxy reaches the http fake server.
 */
export class UnguardedAiClientFactory implements AiClientFactory {
  /** The targets of the calls, with the endpoint and the key that the API gave. */
  readonly targets: AiTarget[] = [];

  constructor(private readonly sendTo?: string) {}

  create(target: AiTarget) {
    this.targets.push(target);
    const endpoint = this.sendTo ? `${this.sendTo}/chat/completions` : target.endpoint;
    return createOpenAiClient({ ...target, endpoint }, { fetch: undiciFetch });
  }
}

/**
 * The model list client with no SSRF guard, so e2e tests can reach the fake server. Use it only in tests.
 * Each call goes to `<sendTo>/models`, so a saved https proxy reaches the http fake server.
 */
export class UnguardedModelListClient implements ModelListClient {
  /** The calls, with the URL and the key that the API gave. */
  readonly calls: Array<{ url: string; apiKey: string }> = [];

  constructor(private readonly sendTo: string) {}

  list(url: string, apiKey: string): Promise<string[]> {
    this.calls.push({ url, apiKey });
    return fetchModelIds(`${this.sendTo}/models`, apiKey, { fetch: undiciFetch });
  }
}
