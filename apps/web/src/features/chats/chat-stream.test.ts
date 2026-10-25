import type { ChatStreamEvent } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { streamChat } from "./chat-stream";

const encoder = new TextEncoder();

/** A fetch that answers with a stream of the given byte parts. */
function stubStream(parts: Uint8Array[]) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    });
    init?.signal?.throwIfAborted();
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function line(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function collect(signal = new AbortController().signal): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  await streamChat("/chats/c1/messages", { content: "Hi" }, { signal, onEvent: (event) => events.push(event) });
  return events;
}

const done: ChatStreamEvent = {
  type: "done",
  message: { id: "m2", role: "assistant", content: "Hello", position: 2, editedAt: null, createdAt: "2026-10-21T00:00:00.000Z" },
};

describe("streamChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("it gives start, two deltas, and done in order, and posts the JSON body with the cookie", async () => {
    const fetchMock = stubStream([
      encoder.encode(line({ type: "start", userMessage: null }) + line({ type: "delta", text: "Hel" })),
      encoder.encode(line({ type: "delta", text: "lo" }) + line(done)),
    ]);
    expect(await collect()).toEqual([
      { type: "start", userMessage: null },
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      done,
    ]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe(JSON.stringify({ content: "Hi" }));
  });

  it("it joins an event that comes in two pieces, and a UTF-8 character split between two pieces", async () => {
    const bytes = encoder.encode(line({ type: "delta", text: "café ✨" }));
    // Split inside the 3 bytes of "✨".
    const cut = bytes.length - 5;
    stubStream([bytes.slice(0, cut), bytes.slice(cut)]);
    expect(await collect()).toEqual([{ type: "delta", text: "café ✨" }]);
  });

  it('it skips ": ping" lines', async () => {
    stubStream([encoder.encode(": ping\n\n" + line({ type: "delta", text: "a" }) + ": ping\n\n")]);
    expect(await collect()).toEqual([{ type: "delta", text: "a" }]);
  });

  it("a 409 JSON answer throws ApiError with the code chat_busy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "chat_busy" }, { status: 409 })));
    await expect(collect()).rejects.toMatchObject({ status: 409, code: "chat_busy" });
    await expect(collect()).rejects.toBeInstanceOf(ApiError);
  });

  it("an abort ends with no error", async () => {
    stubStream([encoder.encode(line({ type: "delta", text: "a" }))]);
    const controller = new AbortController();
    controller.abort();
    await expect(collect(controller.signal)).resolves.toEqual([]);
  });
});
