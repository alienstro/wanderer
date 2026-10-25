import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type EnergyView, type FreeModelView, toEnergy } from "@wanderer/shared";
import { isUuid } from "../common/uuid.js";
import { ENV, type Env } from "../config/env.js";
import { EnergyService } from "../energy/energy.service.js";
import type { FreeModel, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { sceneEnergyPrice } from "../scenes/scene-models.js";
import { chooseFreeModel, isUsable, textEnergyPrice } from "./free-models.js";

const NOT_FOUND = { error: "not_found" };

/** The free models that a user can pick, and the energy view of the user. */
@Injectable()
export class FreeModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly energy: EnergyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The free model of a user with no own model, or null when the free models are off or none is usable. */
  async forUser(user: User): Promise<FreeModel | null> {
    if (!this.env.OPENROUTER_API_KEY) {
      return null;
    }
    const [models, settings] = await Promise.all([
      this.prisma.freeModel.findMany({
        where: { enabled: true, OR: [{ isDefault: true }, ...(user.freeModelId ? [{ id: user.freeModelId }] : [])] },
      }),
      this.energy.settings(),
    ]);
    return chooseFreeModel(models, user.freeModelId, settings);
  }

  /** The usable free models, in the order of the admin page. */
  async list(user: User): Promise<FreeModelView[]> {
    if (!this.env.OPENROUTER_API_KEY) {
      return [];
    }
    const [models, settings] = await Promise.all([
      this.prisma.freeModel.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.energy.settings(),
    ]);
    const active = user.activeProxyId ? null : chooseFreeModel(models, user.freeModelId, settings);
    return models
      .filter((model) => isUsable(model, settings))
      .map((model) => ({
        id: model.id,
        displayName: model.displayName,
        energyPrice: toEnergy(textEnergyPrice(model, settings) ?? 0),
        isDefault: model.isDefault,
        isActive: model.id === active?.id,
      }));
  }

  /** Picks a free model. The next reply uses it, also when the user has own models. */
  async activate(user: User, id: string): Promise<FreeModelView[]> {
    if (!this.env.OPENROUTER_API_KEY) {
      throw new ConflictException({ error: "free_models_off" });
    }
    const model = isUuid(id) ? await this.prisma.freeModel.findUnique({ where: { id } }) : null;
    if (!model || !isUsable(model, await this.energy.settings())) {
      throw new NotFoundException(NOT_FOUND);
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { freeModelId: id, activeProxyId: null } });
    return this.list(updated);
  }

  /** The balance, after a refill that is due, and the price of each action for this user. */
  async energyView(user: User): Promise<EnergyView> {
    const [{ balance, dailyEnergy, nextRefillAt }, settings] = await Promise.all([
      this.energy.balance(user.id),
      this.energy.settings(),
    ]);
    const sceneModel = await this.prisma.sceneModel.findUniqueOrThrow({ where: { key: settings.sceneModelKey } });
    const free = user.activeProxyId ? null : await this.forUser(user);
    return {
      balance: toEnergy(balance),
      dailyEnergy: toEnergy(dailyEnergy),
      nextRefillAt: nextRefillAt.toISOString(),
      model: user.activeProxyId ? "own" : free ? "free" : null,
      prices: {
        reply: free ? toEnergy(textEnergyPrice(free, settings) ?? 0) : 0,
        choices: free ? toEnergy(settings.choicesPrice) : 0,
        memory: free ? toEnergy(settings.memoryPrice) : 0,
        scene: toEnergy(sceneEnergyPrice(sceneModel, settings)),
      },
    };
  }
}
