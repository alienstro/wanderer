import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  AI_ERROR_TEXT,
  type AdminEnergySettings,
  type AdminEnergyView,
  type AdminFreeModel,
  type AdminSceneModel,
  energySettingsInputSchema,
  energyUsdValue,
  freeModelCreateSchema,
  freeModelTestSchema,
  freeModelUpdateSchema,
  type ProxyTestResult,
  SCENE_MODEL_KEYS,
  SCENE_MODEL_LABELS,
  type SceneModelKey,
  sceneModelInputSchema,
  textReplyCostUsd,
  toEnergy,
} from "@wanderer/shared";
import type { z } from "zod";
import { AI_CLIENT_FACTORY, type AiClientFactory } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import { ModelListError } from "../ai/model-list.js";
import { OPENROUTER_PRICES_CLIENT, type OpenRouterPricesClient, paidId } from "../ai/openrouter-prices.js";
import { isUuid } from "../common/uuid.js";
import { ENV, type Env } from "../config/env.js";
import { EnergyService } from "../energy/energy.service.js";
import { EventsService } from "../events/events.service.js";
import { OPENROUTER_CHAT_URL, textEnergyPrice } from "../free-models/free-models.js";
import { type EnergySettings, type FreeModel, Prisma, type SceneModel, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { sceneEnergyPrice } from "../scenes/scene-models.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TEST_MESSAGE = "Reply with the word OK.";
const TEST_TIMEOUT_MS = 30_000;
const NOT_FOUND = { error: "not_found" };

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_energy", fields });
  }
  return parsed.data;
}

function toSettingsView(row: EnergySettings): AdminEnergySettings {
  return {
    dailyEnergy: toEnergy(row.dailyEnergy),
    choicesPrice: toEnergy(row.choicesPrice),
    memoryPrice: toEnergy(row.memoryPrice),
    sceneModelKey: row.sceneModelKey as SceneModelKey,
    textMarkupPercent: row.textMarkupPercent,
    imageMarkupPercent: row.imageMarkupPercent,
    freeDailyCap: row.freeDailyCap,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFreeModelView(row: FreeModel, settings: EnergySettings): AdminFreeModel {
  const prompt = row.promptPriceUsd?.toNumber() ?? null;
  const completion = row.completionPriceUsd?.toNumber() ?? null;
  const price = textEnergyPrice(row, settings);
  return {
    id: row.id,
    openrouterId: row.openrouterId,
    displayName: row.displayName,
    enabled: row.enabled,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    promptPriceUsd: prompt,
    completionPriceUsd: completion,
    pricesFetchedAt: row.pricesFetchedAt?.toISOString() ?? null,
    ownMarkupPercent: row.markupPercent,
    markupPercent: row.markupPercent ?? settings.textMarkupPercent,
    manualEnergyPrice: row.manualEnergyPrice === null ? null : toEnergy(row.manualEnergyPrice),
    costUsd: prompt === null || completion === null ? null : Number(textReplyCostUsd(prompt, completion).toFixed(10)),
    energyPrice: price === null ? null : toEnergy(price),
    usdValue: price === null ? null : energyUsdValue(price),
  };
}

function toSceneModelView(row: SceneModel, settings: EnergySettings): AdminSceneModel {
  const price = sceneEnergyPrice(row, settings);
  const key = row.key as SceneModelKey;
  return {
    key,
    label: SCENE_MODEL_LABELS[key] ?? row.key,
    costUsd: row.costUsd.toNumber(),
    ownMarkupPercent: row.markupPercent,
    markupPercent: row.markupPercent ?? settings.imageMarkupPercent,
    enabled: row.enabled,
    active: row.key === settings.sceneModelKey,
    energyPrice: toEnergy(price),
    usdValue: energyUsdValue(price),
  };
}

function isSceneModelKey(value: string): value is SceneModelKey {
  return (SCENE_MODEL_KEYS as readonly string[]).includes(value);
}

/**
 * The admin page "Energy and models": the settings, the free text models and the scene models. Each change records
 * an `admin_change` app event with the admin, the old value and the new value. The keys stay in the env.
 */
@Injectable()
export class EnergyAdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnergyAdminService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly energy: EnergyService,
    private readonly events: EventsService,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
    @Inject(OPENROUTER_PRICES_CLIENT) private readonly prices: OpenRouterPricesClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    // Each hour, the API reads the prices when a read is older than one day. A deploy restarts the timer.
    this.timer = setInterval(() => void this.refreshWhenOld(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async view(): Promise<AdminEnergyView> {
    const [settings, freeModels, sceneModels] = await Promise.all([
      this.energy.settings(),
      this.prisma.freeModel.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.sceneModel.findMany({ orderBy: { key: "asc" } }),
    ]);
    return {
      settings: toSettingsView(settings),
      freeModels: freeModels.map((row) => toFreeModelView(row, settings)),
      sceneModels: sceneModels.map((row) => toSceneModelView(row, settings)),
    };
  }

  async updateSettings(admin: User, body: unknown): Promise<AdminEnergyView> {
    const input = parse(energySettingsInputSchema, body);
    const scene = await this.prisma.sceneModel.findUnique({ where: { key: input.sceneModelKey } });
    if (!scene?.enabled) {
      throw new BadRequestException({ error: "scene_model_off" });
    }
    const old = await this.energy.settings();
    const row = await this.prisma.energySettings.update({ where: { id: 1 }, data: { ...input, updatedById: admin.id } });
    await this.audit(admin, "settings", toSettingsView(old), toSettingsView(row));
    return this.view();
  }

  /** Adds a model and reads its prices. A failed read saves no price, and the admin can refresh later. */
  async createFreeModel(admin: User, body: unknown): Promise<AdminFreeModel> {
    const input = parse(freeModelCreateSchema, body);
    const prices = await this.readPrice(input.openrouterId);
    const settings = await this.energy.settings();
    const data = {
      ...input,
      promptPriceUsd: prices?.prompt ?? null,
      completionPriceUsd: prices?.completion ?? null,
      pricesFetchedAt: prices ? new Date() : null,
    };
    this.assertPriced(data);
    let row: FreeModel;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.freeModel.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.freeModel.create({ data });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ error: "model_exists" });
      }
      throw error;
    }
    const view = toFreeModelView(row, settings);
    await this.audit(admin, "free_model", null, view);
    return view;
  }

  async updateFreeModel(admin: User, id: string, body: unknown): Promise<AdminFreeModel> {
    const current = await this.findFreeModel(id);
    const input = parse(freeModelUpdateSchema, body);
    const settings = await this.energy.settings();
    this.assertPriced({ ...current, ...input });
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.freeModel.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.freeModel.update({ where: { id }, data: input });
    });
    const view = toFreeModelView(row, settings);
    await this.audit(admin, "free_model", toFreeModelView(current, settings), view);
    return view;
  }

  /** The users who picked the model go back to the default model: the foreign key sets their pick to null. */
  async removeFreeModel(admin: User, id: string): Promise<void> {
    const current = await this.findFreeModel(id);
    await this.prisma.freeModel.delete({ where: { id } });
    await this.audit(admin, "free_model", toFreeModelView(current, await this.energy.settings()), null);
  }

  /** Sends one short call to the model with the server key, before the admin saves it. A failed call is a result. */
  async testFreeModel(body: unknown): Promise<ProxyTestResult> {
    const { openrouterId } = parse(freeModelTestSchema, body);
    const apiKey = this.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new ConflictException({ error: "no_server_key" });
    }
    const started = Date.now();
    try {
      const completion = await this.clients
        .create({ endpoint: OPENROUTER_CHAT_URL, apiKey, model: openrouterId })
        .chat.completions.create(
          { model: openrouterId, messages: [{ role: "user", content: TEST_MESSAGE }], max_tokens: 5 },
          { timeout: TEST_TIMEOUT_MS },
        );
      return { ok: true, reply: completion.choices[0]?.message.content?.trim() ?? "", latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn({ msg: "Free model test failed", ...aiErrorLogFields(error) });
      const code = toAiError(error);
      return { ok: false, error: code, message: AI_ERROR_TEXT[code] };
    }
  }

  /** Reads the prices of all free models. A failed read gives 502 and keeps each last price. */
  async refreshPrices(): Promise<AdminEnergyView> {
    let list: Awaited<ReturnType<OpenRouterPricesClient["list"]>>;
    try {
      list = await this.prices.list();
    } catch (error) {
      if (error instanceof ModelListError) {
        this.logger.warn({ msg: "OpenRouter price read failed", code: error.code });
        throw new HttpException({ error: "price_refresh_failed" }, 502);
      }
      throw error;
    }
    const now = new Date();
    const models = await this.prisma.freeModel.findMany({ select: { id: true, openrouterId: true } });
    await this.prisma.$transaction(
      models.map((model) => {
        const price = list.get(paidId(model.openrouterId));
        return this.prisma.freeModel.update({
          where: { id: model.id },
          data: { promptPriceUsd: price?.prompt ?? null, completionPriceUsd: price?.completion ?? null, pricesFetchedAt: now },
        });
      }),
    );
    return this.view();
  }

  async updateSceneModel(admin: User, key: string, body: unknown): Promise<AdminSceneModel> {
    const current = isSceneModelKey(key) ? await this.prisma.sceneModel.findUnique({ where: { key } }) : null;
    if (!current) {
      throw new NotFoundException(NOT_FOUND);
    }
    const input = parse(sceneModelInputSchema, body);
    const settings = await this.energy.settings();
    if (!input.enabled && settings.sceneModelKey === key) {
      throw new ConflictException({ error: "scene_model_active" });
    }
    const row = await this.prisma.sceneModel.update({ where: { key }, data: input });
    const view = toSceneModelView(row, settings);
    await this.audit(admin, "scene_model", toSceneModelView(current, settings), view);
    return view;
  }

  /** The prices of the paid version of one model, or null when OpenRouter has none or the read failed. */
  private async readPrice(openrouterId: string) {
    try {
      return (await this.prices.list()).get(paidId(openrouterId)) ?? null;
    } catch (error) {
      if (error instanceof ModelListError) {
        this.logger.warn({ msg: "OpenRouter price read failed", code: error.code });
        return null;
      }
      throw error;
    }
  }

  /** An enabled model must have a price: from OpenRouter or a manual price. */
  private assertPriced(model: {
    enabled: boolean;
    manualEnergyPrice: number | null;
    promptPriceUsd: unknown;
    completionPriceUsd: unknown;
  }): void {
    const priced = model.manualEnergyPrice !== null || (model.promptPriceUsd !== null && model.completionPriceUsd !== null);
    if (model.enabled && !priced) {
      throw new BadRequestException({ error: "price_required" });
    }
  }

  private async findFreeModel(id: string): Promise<FreeModel> {
    const row = isUuid(id) ? await this.prisma.freeModel.findUnique({ where: { id } }) : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }

  private audit(admin: User, target: string, old: object | null, next: object | null): Promise<void> {
    return this.events.record("admin_change", {
      userId: admin.id,
      reason: target,
      details: JSON.parse(JSON.stringify({ old, new: next })) as Prisma.InputJsonObject,
    });
  }

  private async refreshWhenOld(): Promise<void> {
    try {
      const old = await this.prisma.freeModel.count({
        where: { OR: [{ pricesFetchedAt: null }, { pricesFetchedAt: { lt: new Date(Date.now() - DAY_MS) } }] },
      });
      if (old > 0) {
        await this.refreshPrices();
      }
    } catch (error) {
      this.logger.warn({ msg: "Daily price refresh failed", name: error instanceof Error ? error.name : "unknown" });
    }
  }
}
