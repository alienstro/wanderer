import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { estimateTokens, MEMORY_MAX, type MemoryDraftResponse } from "@wanderer/shared";
import { AI_CLIENT_FACTORY, type AiClientFactory } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import type { Message, User } from "../generated/prisma/client.js";
import { ProxiesService } from "../proxies/proxies.service.js";
import { ChatsService } from "./chats.service.js";
import { buildSummaryPrompt, summaryInputTokens, windowStart } from "./prompt.js";

const SUMMARY_MAX_TOKENS = 800;
const SUMMARY_TIMEOUT_MS = 60_000;

/** The oldest messages up to the summary cap. The first message always goes in. */
function capSummaryInput(messages: Message[], cap: number): Message[] {
  const kept: Message[] = [];
  let total = 0;
  for (const message of messages) {
    total += estimateTokens(message.content);
    if (kept.length > 0 && total > cap) {
      break;
    }
    kept.push(message);
  }
  return kept;
}

/** Writes a memory draft from the saved memory and the old messages that no saved summary covers. */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly chats: ChatsService,
    private readonly proxies: ProxiesService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
  ) {}

  /** Saves nothing. The user reads and edits the draft, then saves it with PATCH /chats/:id/memory. */
  async draft(user: User, chatId: string): Promise<MemoryDraftResponse> {
    const { chat, character, history } = await this.chats.loadForReply(chatId, user);
    const { target, customPrompt, contextTokens } = await this.proxies.loadTarget(user);
    const input = { character, customPrompt, contextTokens, memory: chat.memory, userName: user.name, history };
    const through = chat.memoryThroughPosition;
    const uncovered = history
      .slice(0, windowStart(input, 0))
      .filter((message) => through === null || message.position > through);
    const sent = capSummaryInput(uncovered, summaryInputTokens(input));
    const last = sent.at(-1);
    if (!last) {
      return { memory: chat.memory, throughPosition: through };
    }
    let text: string;
    try {
      const completion = await this.clients
        .create(target)
        .chat.completions.create(
          { model: target.model, messages: buildSummaryPrompt({ ...input, history: sent }), max_tokens: SUMMARY_MAX_TOKENS },
          { timeout: SUMMARY_TIMEOUT_MS },
        );
      text = completion.choices[0]?.message.content?.trim() ?? "";
    } catch (error) {
      this.logger.warn({ msg: "Proxy summary failed", ...aiErrorLogFields(error) });
      throw new HttpException({ error: toAiError(error) }, 502);
    }
    if (!text) {
      throw new HttpException({ error: "summary_failed" }, 502);
    }
    return { memory: text.slice(0, MEMORY_MAX), throughPosition: last.position };
  }
}
