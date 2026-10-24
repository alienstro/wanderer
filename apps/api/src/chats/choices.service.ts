import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import type { ChoicesResponse } from "@wanderer/shared";
import { AI_CLIENT_FACTORY, type AiClientFactory } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import type { User } from "../generated/prisma/client.js";
import { ProxiesService } from "../proxies/proxies.service.js";
import { ChatsService } from "./chats.service.js";
import { buildChoicesPrompt, parseChoices } from "./prompt.js";

const ATTEMPTS = 2;
const CHOICES_MAX_TOKENS = 400;
const CHOICES_TIMEOUT_MS = 30_000;

/** Makes four short replies in the user's voice with a second, short call to the same proxy. */
@Injectable()
export class ChoicesService {
  private readonly logger = new Logger(ChoicesService.name);

  constructor(
    private readonly chats: ChatsService,
    private readonly proxies: ProxiesService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
  ) {}

  /** Tries one more time after a bad answer. Then it gives 502, and the web hides the choices. */
  async make(user: User, chatId: string): Promise<ChoicesResponse> {
    const { character, history } = await this.chats.loadForReply(chatId, user);
    const { target, customPrompt, contextTokens } = await this.proxies.loadTarget(user);
    const messages = buildChoicesPrompt({ character, customPrompt, contextTokens, userName: user.name, history });
    const client = this.clients.create(target);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let text: string;
      try {
        const completion = await client.chat.completions.create(
          { model: target.model, messages, max_tokens: CHOICES_MAX_TOKENS },
          { timeout: CHOICES_TIMEOUT_MS },
        );
        text = completion.choices[0]?.message.content ?? "";
      } catch (error) {
        this.logger.warn({ msg: "Proxy choices failed", ...aiErrorLogFields(error) });
        throw new HttpException({ error: toAiError(error) }, 502);
      }
      const choices = parseChoices(text);
      if (choices) {
        return { choices };
      }
    }
    throw new HttpException({ error: "choices_failed" }, 502);
  }
}
