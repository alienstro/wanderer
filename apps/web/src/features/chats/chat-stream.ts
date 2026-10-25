import type { ChatStreamEvent } from "@wanderer/shared";
import { apiResponse } from "@/lib/api";

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Reads the events in a text with complete blocks. A comment line (":") is not an event. */
function readEvents(blocks: string, onEvent: (event: ChatStreamEvent) => void): void {
  for (const block of blocks.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        onEvent(JSON.parse(line.slice("data:".length).trim()) as ChatStreamEvent);
      }
    }
  }
}

/**
 * Posts to a reply stream of the API and gives each Server-Sent Event. The API streams from a POST, so the
 * browser reads the body with fetch, not with EventSource. A JSON error before the stream throws ApiError.
 * An abort (the Stop button) ends the read with no error.
 */
export async function streamChat(
  path: string,
  body: unknown,
  options: { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void },
): Promise<void> {
  try {
    const res = await apiResponse(path, { method: "POST", body: JSON.stringify(body), signal: options.signal });
    if (!res.body) {
      return;
    }
    const reader = res.body.getReader();
    // The decoder keeps a UTF-8 character that two pieces split.
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const end = buffer.lastIndexOf("\n\n");
      if (end >= 0) {
        readEvents(buffer.slice(0, end), options.onEvent);
        buffer = buffer.slice(end + 2);
      }
    }
    readEvents(buffer + decoder.decode(), options.onEvent);
  } catch (error) {
    if (isAbort(error) || options.signal.aborted) {
      return;
    }
    throw error;
  }
}
