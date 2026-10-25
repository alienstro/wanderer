import { ConflictException, HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { SCENE_DAILY_LIMIT, type SceneView } from "@wanderer/shared";
import { AI_CLIENT_FACTORY, type AiClientFactory } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import { ChatsService, type ReplyContext, toSceneView } from "../chats/chats.service.js";
import { buildScenePrompt, cleanScenePrompt } from "../chats/prompt.js";
import { FilesService } from "../files/files.service.js";
import { InvalidImageError } from "../files/image.js";
import type { User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProxiesService } from "../proxies/proxies.service.js";
import { SCENE_IMAGE_CLIENT, type SceneImageClient, SceneImageError, type SceneImageRequest } from "./runpod-client.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PROMPT_MAX_TOKENS = 300;
const PROMPT_TIMEOUT_MS = 30_000;
const BASE_NEGATIVE = "text, watermark, blurry";
const SAFE_SUFFIX = "Safe for work, everyone fully clothed.";
const SAFE_NEGATIVE = "nudity, nsfw, sexual content, gore";

/** The request for the image model. A chat that is not 18+ also asks for a safe image. */
export function sceneImageRequest(prompt: string, adult: boolean): SceneImageRequest {
  return adult
    ? { prompt, negativePrompt: BASE_NEGATIVE }
    : { prompt: `${prompt} ${SAFE_SUFFIX}`, negativePrompt: `${BASE_NEGATIVE}, ${SAFE_NEGATIVE}` };
}

/**
 * Makes one scene image of a chat: the active model writes the image prompt from the latest messages, then
 * RunPod draws it. Only a click on "Generate scene" calls this service.
 */
@Injectable()
export class ScenesService {
  private readonly logger = new Logger(ScenesService.name);
  /**
   * The IDs of the users with a running job. One job for each user at a time also keeps the daily count
   * correct. The API runs as one container, so memory is enough.
   */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly proxies: ProxiesService,
    private readonly files: FilesService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
    @Inject(SCENE_IMAGE_CLIENT) private readonly images: SceneImageClient,
  ) {}

  async generate(user: User, chatId: string): Promise<SceneView> {
    if (this.running.has(user.id)) {
      throw new ConflictException({ error: "scene_busy" });
    }
    this.running.add(user.id);
    try {
      return await this.make(user, chatId);
    } finally {
      this.running.delete(user.id);
    }
  }

  private async make(user: User, chatId: string): Promise<SceneView> {
    const context = await this.chats.loadForReply(chatId, user);
    const { chat, character, history } = context;
    const used = await this.prisma.sceneImage.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (used >= SCENE_DAILY_LIMIT) {
      throw new HttpException({ error: "scene_limit" }, 429);
    }
    const prompt = await this.writePrompt(user, context);
    const image = await this.images.generate(sceneImageRequest(prompt, character.isAdult)).catch((error: unknown) => {
      if (error instanceof SceneImageError) {
        this.logger.warn(`The scene image failed: ${error.message}`);
        throw new HttpException({ error: error.code }, error.code === "scene_timeout" ? 504 : 502);
      }
      throw error;
    });
    const file = await this.files.saveScene(user.id, image).catch((error: unknown) => {
      if (error instanceof InvalidImageError) {
        this.logger.warn(`RunPod gave a broken image: ${error.message}`);
        throw new HttpException({ error: "scene_failed" }, 502);
      }
      throw error;
    });
    const row = await this.prisma.sceneImage.create({
      data: { userId: user.id, chatId: chat.id, fileId: file.id, afterPosition: history.at(-1)?.position ?? 0 },
    });
    return toSceneView(row);
  }

  /** One short call to the active proxy that describes the scene for the image model. */
  private async writePrompt(user: User, chat: ReplyContext): Promise<string> {
    const { target, customPrompt, contextTokens } = await this.proxies.loadTarget(user);
    const { character, history } = chat;
    const messages = buildScenePrompt(
      { character, customPrompt, contextTokens, memory: chat.chat.memory, userName: user.name, history },
      { adult: character.isAdult },
    );
    let text: string;
    try {
      const completion = await this.clients
        .create(target)
        .chat.completions.create(
          { model: target.model, messages, max_tokens: PROMPT_MAX_TOKENS },
          { timeout: PROMPT_TIMEOUT_MS },
        );
      text = completion.choices[0]?.message.content ?? "";
    } catch (error) {
      this.logger.warn({ msg: "Proxy scene prompt failed", ...aiErrorLogFields(error) });
      throw new HttpException({ error: toAiError(error) }, 502);
    }
    const prompt = cleanScenePrompt(text);
    if (!prompt) {
      throw new HttpException({ error: "scene_failed" }, 502);
    }
    return prompt;
  }
}
