import { BadRequestException, ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { type AiErrorCode, messageInputSchema } from "@wanderer/shared";
import type { Response } from "express";
import { AI_CLIENT_FACTORY, type AiClientFactory, type AiTarget } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import type { Message, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProxiesService } from "../proxies/proxies.service.js";
import { ChatsService, toMessageView } from "./chats.service.js";
import { buildReplyPrompt } from "./prompt.js";
import { openSse, type SseWriter } from "./sse.js";

export interface ReplyTiming {
  /** The time limit to the first piece of the reply. */
  firstPieceMs: number;
  /** The time limit for the full reply. */
  totalMs: number;
  /** The time between two SSE comment lines. */
  heartbeatMs: number;
}

/** The Nest injection token for the time limits of a reply. Tests use short values. */
export const REPLY_TIMING = Symbol("REPLY_TIMING");

export const DEFAULT_REPLY_TIMING: ReplyTiming = { firstPieceMs: 30_000, totalMs: 180_000, heartbeatMs: 15_000 };

/** A send has the request body with the message text. A regenerate has no body. */
export type ReplyMode = { kind: "send"; body: unknown } | { kind: "regenerate" };

interface Generated {
  text: string;
  /** The error code, or null when the reply came in full. */
  error: AiErrorCode | null;
  /** True when the client closed the connection before the end. */
  clientGone: boolean;
}

/** Streams the AI replies of a chat to the browser, and saves them. */
@Injectable()
export class ReplyService {
  private readonly logger = new Logger(ReplyService.name);
  /** The chats with a running stream. The API runs as one container, so a set in memory is enough. */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly proxies: ProxiesService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
    @Inject(REPLY_TIMING) private readonly timing: ReplyTiming,
  ) {}

  /**
   * Checks the request, then streams a reply. The checks come before the SSE headers, so their errors
   * stay JSON. After the headers, each error is an SSE error event.
   */
  async stream(input: { user: User; chatId: string; res: Response; mode: ReplyMode }): Promise<void> {
    const { user, res, mode } = input;
    const content = mode.kind === "send" ? this.parseContent(mode.body) : null;
    const { chat, character, history } = await this.chats.loadForReply(input.chatId, user);
    const replaced = mode.kind === "regenerate" ? regenerateTarget(history) : null;
    const { target, customPrompt } = await this.proxies.loadTarget(user);
    if (this.busy.has(chat.id)) {
      throw new ConflictException({ error: "chat_busy" });
    }
    this.busy.add(chat.id);
    let sse: SseWriter | null = null;
    try {
      const userMessage = content === null ? null : await this.saveMessage(chat.id, "user", content, nextPosition(history));
      if (userMessage) {
        history.push(userMessage);
      }
      // A regenerate sends the history without the reply that it replaces.
      const promptHistory = replaced ? history.filter((message) => message.id !== replaced.id) : history;
      sse = openSse(res, this.timing.heartbeatMs);
      sse.send({ type: "start", userMessage: userMessage && toMessageView(userMessage) });
      const prompt = buildReplyPrompt({ character, customPrompt, userName: user.name, history: promptHistory });
      const result = await this.generate(target, prompt, res, sse);
      // An empty result keeps the old reply. Only a reply with text replaces it.
      const reply = result.text.trim()
        ? replaced
          ? await this.replaceMessage(chat.id, replaced.id, result.text)
          : await this.saveMessage(chat.id, "assistant", result.text, nextPosition(history))
        : null;
      if (result.clientGone) {
        return;
      }
      if (reply && !result.error) {
        sse.send({ type: "done", message: toMessageView(reply) });
      } else {
        sse.send({ type: "error", error: result.error ?? "provider_error", message: reply && toMessageView(reply) });
      }
    } catch (error) {
      this.logger.error({ msg: "Reply stream failed", name: error instanceof Error ? error.name : "unknown" });
      if (!sse) {
        throw error;
      }
      sse.send({ type: "error", error: "provider_error", message: null });
    } finally {
      sse?.end();
      this.busy.delete(chat.id);
    }
  }

  private parseContent(body: unknown): string {
    const parsed = messageInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_message" });
    }
    return parsed.data.content;
  }

  /** Calls the proxy with a stream and sends each piece. A Stop or a time limit aborts the call. */
  private async generate(
    target: AiTarget,
    messages: ReturnType<typeof buildReplyPrompt>,
    res: Response,
    sse: SseWriter,
  ): Promise<Generated> {
    const controller = new AbortController();
    let reason: "client" | "time" | null = null;
    const abort = (why: "client" | "time") => {
      if (!reason) {
        reason = why;
        controller.abort();
      }
    };
    // "close" on the response, not on the request: the request closes when its body is read.
    const onClose = () => {
      if (!res.writableFinished) {
        abort("client");
      }
    };
    res.on("close", onClose);
    const firstTimer = setTimeout(() => abort("time"), this.timing.firstPieceMs);
    const totalTimer = setTimeout(() => abort("time"), this.timing.totalMs);
    let text = "";
    let error: AiErrorCode | null = null;
    try {
      const stream = await this.clients
        .create(target)
        .chat.completions.create({ model: target.model, messages, stream: true }, { signal: controller.signal });
      for await (const part of stream) {
        const piece = part.choices[0]?.delta?.content ?? "";
        if (piece) {
          clearTimeout(firstTimer);
          text += piece;
          sse.send({ type: "delta", text: piece });
        }
      }
    } catch (caught) {
      if (reason === null) {
        this.logger.warn({ msg: "Proxy reply failed", ...aiErrorLogFields(caught) });
        error = toAiError(caught);
      }
    } finally {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      res.off("close", onClose);
    }
    // The SDK stream can end with no error after an abort, so the abort reason decides the result too.
    if (reason === "time") {
      error = "timeout";
    }
    return { text, error, clientGone: reason === "client" };
  }

  private async replaceMessage(chatId: string, messageId: string, content: string) {
    const [message] = await this.prisma.$transaction([
      this.prisma.message.update({ where: { id: messageId }, data: { content } }),
      this.prisma.chat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } }),
    ]);
    return message;
  }

  private async saveMessage(chatId: string, role: "user" | "assistant", content: string, position: number) {
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { chatId, role, content, position } }),
      this.prisma.chat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } }),
    ]);
    return message;
  }
}

/**
 * The reply that a regenerate replaces: the last message when it is an AI reply after the opening.
 * After a user message with no reply, a regenerate makes a new reply, so the result is null.
 */
function regenerateTarget(history: Message[]): Message | null {
  const last = history.at(-1);
  if (last?.role === "assistant" && last.position > 0) {
    return last;
  }
  if (last?.role === "user") {
    return null;
  }
  throw new ConflictException({ error: "nothing_to_regenerate" });
}

function nextPosition(history: Message[]): number {
  return (history.at(-1)?.position ?? -1) + 1;
}
