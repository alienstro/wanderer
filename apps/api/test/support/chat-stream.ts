import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ChatStreamEvent } from "@wanderer/shared";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { WEB_ORIGIN } from "./env.js";
import type { TestUser } from "./users.js";

/** Reads the SSE events of a reply stream. Comment lines such as ": ping" are not events. */
export function parseEvents(text: string): ChatStreamEvent[] {
  return text
    .split("\n\n")
    .flatMap((block) => block.split("\n"))
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as ChatStreamEvent);
}

/** Posts to a stream endpoint and waits for the full answer. */
export function postStream(app: NestExpressApplication, user: TestUser, path: string, body: object = {}) {
  return request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("Cookie", user.cookie)
    .send(body)
    .buffer(true)
    .parse((res, done) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (part: string) => (text += part));
      res.on("end", () => done(null, text));
    });
}

/** Starts the app on a free port, for a test that must read or abort a stream while it runs. */
export async function listen(app: NestExpressApplication): Promise<string> {
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Opens a stream with fetch. `untilDeltas` aborts the request after that number of delta events. */
export async function openStream(
  baseUrl: string,
  user: TestUser,
  path: string,
  body: object,
  untilDeltas?: number,
): Promise<ChatStreamEvent[]> {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: user.cookie },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
      const deltas = parseEvents(text).filter((event) => event.type === "delta").length;
      if (untilDeltas !== undefined && deltas >= untilDeltas) {
        controller.abort();
        break;
      }
    }
  } catch {
    // The abort ends the read.
  }
  return parseEvents(text);
}

/** Waits until the check is true, or fails after the time limit. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor: the time limit ended");
}

/** Saves an API key and a proxy that uses it for the user. The first proxy becomes the active proxy. */
export async function addProxy(app: NestExpressApplication, user: TestUser): Promise<void> {
  const send = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).set("Origin", WEB_ORIGIN).set("Cookie", user.cookie).send(body).expect(201);
  const key = await send("/api-keys", { name: "Main", apiKey: "sk-test-3f9a" });
  await send("/proxies", { name: "Main", baseUrl: "https://api.example.com/v1", model: "fake-model", apiKeyId: key.body.id });
}

/** Starts a chat from the first opening and gives the chat ID. */
export async function startChat(app: NestExpressApplication, user: TestUser, characterId: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/chats")
    .set("Origin", WEB_ORIGIN)
    .set("Cookie", user.cookie)
    .send({ characterId, openingIndex: 0 })
    .expect(201);
  return (res.body as { chat: { id: string } }).chat.id;
}
