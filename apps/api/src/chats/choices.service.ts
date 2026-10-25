import { ConflictException, HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import type { ChoicesResponse } from "@wanderer/shared";
import { AI_CLIENT_FACTORY, type AiClientFactory } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import { AiChargeService } from "../energy/ai-charge.service.js";
import { EventsService } from "../events/events.service.js";
import type { User } from "../generated/prisma/client.js";
import { type LoadedTarget, ProxiesService } from "../proxies/proxies.service.js";
import { ChatsService, type ReplyContext } from "./chats.service.js";
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
    private readonly events: EventsService,
    private readonly charge: AiChargeService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
  ) {}

  /**
   * Tries one more time after a bad answer. Then it gives 502, and the web hides the choices. On a free model, the
   * server checks the "Reply choices" switch, because the choices cost energy.
   */
  async make(user: User, chatId: string): Promise<ChoicesResponse> {
    const context = await this.chats.loadForReply(chatId, user);
    const loaded = await this.proxies.loadTarget(user);
    if (loaded.free && !user.replyChoicesOn) {
      throw new ConflictException({ error: "choices_off" });
    }
    const spend = await this.charge.chargeText(user, loaded.free, "choices", context.chat.id);
    try {
      return await this.ask(user, context, loaded);
    } catch (error) {
      await this.charge.refund(spend);
      throw error;
    }
  }

  private async ask(user: User, context: ReplyContext, loaded: LoadedTarget): Promise<ChoicesResponse> {
    const { chat, character, history } = context;
    const { target, customPrompt, contextTokens, free } = loaded;
    const messages = buildChoicesPrompt(
      {
        character,
        customPrompt,
        contextTokens,
        memory: chat.memory,
        userName: user.name,
        history,
      },
      user.replyChoicesPrompt,
    );
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
        const code = await this.charge.callError(toAiError(error), user, free);
        await this.events.record("choices_failed", { userId: user.id, characterId: chat.characterId, reason: code });
        throw new HttpException({ error: code }, 502);
      }
      const choices = parseChoices(text);
      if (choices) {
        return { choices };
      }
    }
    await this.events.record("choices_failed", { userId: user.id, characterId: chat.characterId, reason: "bad_choices" });
    throw new HttpException({ error: "choices_failed" }, 502);
  }
}
