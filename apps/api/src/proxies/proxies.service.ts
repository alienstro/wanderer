import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AI_ERROR_TEXT,
  type MeResponse,
  PROXY_CONTEXT_DEFAULT,
  PROXY_LIMIT,
  PROXY_MODELS_ERROR_TEXT,
  proxyCreateSchema,
  type ProxyModelsError,
  type ProxyModelsResult,
  proxyModelsSchema,
  type ProxyTestResult,
  proxyUpdateSchema,
  type ProxyView,
} from "@wanderer/shared";
import type { z } from "zod";
import { AI_CLIENT_FACTORY, type AiClientFactory, type AiTarget, proxyEndpoint } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import { MODEL_LIST_CLIENT, type ModelListClient, ModelListError, modelsUrl } from "../ai/model-list.js";
import { assertProxyUrl, BlockedUrlError } from "../ai/url-guard.js";
import { ApiKeysService } from "../api-keys/api-keys.service.js";
import { EventsService } from "../events/events.service.js";
import { KeyDecryptError } from "../api-keys/key-cipher.js";
import { isUuid } from "../common/uuid.js";
import { ENV, type Env } from "../config/env.js";
import { OPENROUTER_CHAT_URL } from "../free-models/free-models.js";
import { FreeModelsService } from "../free-models/free-models.service.js";
import type { ApiKey, FreeModel, Proxy, User } from "../generated/prisma/client.js";
import { activateFirstProxy, MeService } from "../me/me.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const NOT_FOUND = { error: "not_found" };
const TEST_MESSAGE = "Reply with the word OK.";
const TEST_TIMEOUT_MS = 30_000;

/** The data for one AI call. `free` is the free model of the call, or null for an own model. */
export interface LoadedTarget {
  target: AiTarget;
  customPrompt: string;
  contextTokens: number;
  free: FreeModel | null;
}

/** A proxy with its saved key. Each read of a proxy includes the key row. */
type ProxyWithKey = Proxy & { apiKey: ApiKey };

const WITH_KEY = { apiKey: true } as const;

function toProxyView(row: ProxyWithKey, activeProxyId: string | null): ProxyView {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    appendPath: row.appendPath,
    model: row.model,
    customPrompt: row.customPrompt,
    contextTokens: row.contextTokens,
    savedKey: { id: row.apiKey.id, name: row.apiKey.name, keyLast4: row.apiKey.keyLast4 },
    isActive: row.id === activeProxyId,
    createdAt: row.createdAt.toISOString(),
  };
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_proxy", fields });
  }
  return parsed.data;
}

function modelsFailure(error: ProxyModelsError): ProxyModelsResult {
  return { ok: false, error, message: PROXY_MODELS_ERROR_TEXT[error] };
}

/** The static SSRF check at save time. The AI client checks the DNS answer again at each call. */
function assertSafeUrl(baseUrl: string, appendPath: boolean): void {
  try {
    assertProxyUrl(proxyEndpoint(baseUrl, appendPath));
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      throw new BadRequestException({ error: "blocked_url", fields: ["baseUrl"] });
    }
    throw error;
  }
}

@Injectable()
export class ProxiesService {
  private readonly logger = new Logger(ProxiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly apiKeys: ApiKeysService,
    private readonly events: EventsService,
    private readonly freeModels: FreeModelsService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
    @Inject(MODEL_LIST_CLIENT) private readonly modelLists: ModelListClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(user: User): Promise<ProxyView[]> {
    const rows = await this.prisma.proxy.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: WITH_KEY,
    });
    return rows.map((row) => toProxyView(row, user.activeProxyId));
  }

  /** Saves a new proxy with a saved key of the user. The first proxy of a user becomes the active proxy. */
  async create(user: User, body: unknown): Promise<ProxyView> {
    const input = parse(proxyCreateSchema, body);
    assertSafeUrl(input.baseUrl, input.appendPath);
    await this.apiKeys.findOwn(user, input.apiKeyId);
    if ((await this.prisma.proxy.count({ where: { userId: user.id } })) >= PROXY_LIMIT) {
      throw new ConflictException({ error: "proxy_limit" });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proxy.create({ data: { userId: user.id, ...input }, include: WITH_KEY });
      await activateFirstProxy(tx, user.id, created.id);
      return created;
    });
    return toProxyView(row, user.activeProxyId ?? row.id);
  }

  /** Changes the fields that the body sends. An absent apiKeyId keeps the current key. */
  async update(user: User, id: string, body: unknown): Promise<ProxyView> {
    const current = await this.findOwn(user, id);
    const fields = parse(proxyUpdateSchema, body);
    assertSafeUrl(fields.baseUrl ?? current.baseUrl, fields.appendPath ?? current.appendPath);
    if (fields.apiKeyId) {
      await this.apiKeys.findOwn(user, fields.apiKeyId);
    }
    const row = await this.prisma.proxy.update({ where: { id }, data: fields, include: WITH_KEY });
    return toProxyView(row, user.activeProxyId);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.findOwn(user, id);
    // The foreign key sets activeProxyId to null when this proxy is the active proxy.
    await this.prisma.proxy.delete({ where: { id } });
  }

  async activate(user: User, id: string): Promise<MeResponse> {
    await this.findOwn(user, id);
    const updated = await this.me.setActiveProxy(user.id, id);
    return this.me.toResponse(updated);
  }

  /** Sends one small request to the proxy and gives the result. A failed call is a result, not an error. */
  async test(user: User, id: string): Promise<ProxyTestResult> {
    const row = await this.findOwn(user, id);
    let target: AiTarget;
    try {
      target = this.target(row);
    } catch (error) {
      if (error instanceof KeyDecryptError) {
        await this.events.record("proxy_test_failed", { userId: user.id, reason: "invalid_key" });
        return { ok: false, error: "invalid_key", message: AI_ERROR_TEXT.invalid_key };
      }
      throw error;
    }
    const started = Date.now();
    try {
      const completion = await this.clients
        .create(target)
        .chat.completions.create(
          { model: row.model, messages: [{ role: "user", content: TEST_MESSAGE }], max_tokens: 5 },
          { timeout: TEST_TIMEOUT_MS },
        );
      const reply = completion.choices[0]?.message.content?.trim() ?? "";
      return { ok: true, reply, latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn({ msg: "Proxy test failed", ...aiErrorLogFields(error) });
      const code = toAiError(error);
      await this.events.record("proxy_test_failed", { userId: user.id, reason: code });
      return { ok: false, error: code, message: AI_ERROR_TEXT[code] };
    }
  }

  /**
   * Gets the model ids of a proxy. The key comes from the body, or else from a saved key of the user. A failed list is a
   * result, not an error. When "Add /chat/completions" is off, the URL is a full endpoint, so the API does not guess.
   */
  async models(user: User, body: unknown): Promise<ProxyModelsResult> {
    const input = parse(proxyModelsSchema, body);
    assertSafeUrl(input.baseUrl, input.appendPath);
    // A saved key is not bound to one URL: many models on different URLs can use it.
    const saved = input.apiKey ? null : await this.apiKeys.findOwn(user, input.apiKeyId ?? "");
    if (!input.appendPath) {
      return modelsFailure("no_model_list");
    }
    let apiKey = input.apiKey;
    if (saved) {
      try {
        apiKey = this.apiKeys.decrypt(saved);
      } catch (error) {
        if (error instanceof KeyDecryptError) {
          return modelsFailure("invalid_key");
        }
        throw error;
      }
    }
    try {
      return { ok: true, models: await this.modelLists.list(modelsUrl(input.baseUrl), apiKey) };
    } catch (error) {
      if (error instanceof BlockedUrlError) {
        return modelsFailure("blocked_url");
      }
      if (error instanceof ModelListError) {
        this.logger.warn({ msg: "Proxy model list failed", code: error.code });
        await this.events.record("model_list_failed", { userId: user.id, reason: error.code });
        return modelsFailure(error.code);
      }
      throw error;
    }
  }

  /**
   * The target for one call: the decrypted active proxy of the user, or else a free model with the server key. With
   * neither, it throws 409 no_active_proxy.
   */
  async loadTarget(user: User): Promise<LoadedTarget> {
    const row = user.activeProxyId
      ? await this.prisma.proxy.findFirst({ where: { id: user.activeProxyId, userId: user.id }, include: WITH_KEY })
      : null;
    if (!row) {
      const free = await this.freeTarget(user);
      if (!free) {
        throw new ConflictException({ error: "no_active_proxy" });
      }
      return free;
    }
    try {
      return { target: this.target(row), customPrompt: row.customPrompt, contextTokens: row.contextTokens, free: null };
    } catch (error) {
      if (error instanceof KeyDecryptError) {
        // The master key changed. The user must enter the API key again.
        throw new ConflictException({ error: "invalid_key" });
      }
      throw error;
    }
  }

  /** The free model of the user with the server key, or null when the free models are off or none is usable. */
  private async freeTarget(user: User): Promise<LoadedTarget | null> {
    const apiKey = this.env.OPENROUTER_API_KEY;
    const free = apiKey ? await this.freeModels.forUser(user) : null;
    if (!apiKey || !free) {
      return null;
    }
    return {
      target: { endpoint: OPENROUTER_CHAT_URL, apiKey, model: free.openrouterId },
      customPrompt: "",
      contextTokens: PROXY_CONTEXT_DEFAULT,
      free,
    };
  }

  /** The decrypted target for one call. It throws KeyDecryptError when the saved key does not decrypt. */
  private target(row: ProxyWithKey): AiTarget {
    const apiKey = this.apiKeys.decrypt(row.apiKey);
    return { endpoint: proxyEndpoint(row.baseUrl, row.appendPath), apiKey, model: row.model };
  }

  private async findOwn(user: User, id: string): Promise<ProxyWithKey> {
    const row = isUuid(id)
      ? await this.prisma.proxy.findFirst({ where: { id, userId: user.id }, include: WITH_KEY })
      : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }
}
