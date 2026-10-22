import type { ChatStreamEvent } from "@wanderer/shared";
import type { Response } from "express";

export interface SseWriter {
  send(event: ChatStreamEvent): void;
  end(): void;
}

/**
 * Starts a Server-Sent Events answer. Each event is one `data:` line with JSON. A comment line goes out at
 * each heartbeat, so Cloudflare does not close a slow stream. A write after the client left does nothing.
 */
export function openSse(res: Response, heartbeatMs: number): SseWriter {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const write = (text: string) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(text);
    }
  };
  const heartbeat = setInterval(() => write(": ping\n\n"), heartbeatMs);
  return {
    send: (event) => write(`data: ${JSON.stringify(event)}\n\n`),
    end: () => {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    },
  };
}
