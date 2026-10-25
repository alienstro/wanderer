import { HttpException, Injectable } from "@nestjs/common";
import type { AiErrorCode } from "@wanderer/shared";
import { EventsService } from "../events/events.service.js";
import { textEnergyPrice } from "../free-models/free-models.js";
import type { EnergySettings, FreeModel, User } from "../generated/prisma/client.js";
import { type EnergySpend, EnergyService, type SpendReason } from "./energy.service.js";

/** The errors of a free model call that come from the shared limits of the server key. */
const SHARED_LIMIT_ERRORS = new Set<AiErrorCode>(["rate_limited", "usage_limit", "no_credit"]);

/** The price in hundredths of a text action on a free model. */
function textPrice(action: Exclude<SpendReason, "scene">, free: FreeModel, settings: EnergySettings): number {
  switch (action) {
    case "reply":
      return textEnergyPrice(free, settings) ?? 0;
    case "choices":
      return settings.choicesPrice;
    case "memory":
      return settings.memoryPrice;
  }
}

/** The energy rules of the AI actions that use a server key. An own model of the user costs no energy. */
@Injectable()
export class AiChargeService {
  constructor(
    private readonly energy: EnergyService,
    private readonly events: EventsService,
  ) {}

  /** Takes the price of a text action on a free model before the call. Null for an own model. */
  async chargeText(
    user: User,
    free: FreeModel | null,
    action: Exclude<SpendReason, "scene">,
    chatId: string,
  ): Promise<EnergySpend | null> {
    if (!free) {
      return null;
    }
    const settings = await this.energy.settings();
    await this.checkCap(user, settings);
    return this.energy.spend(user.id, textPrice(action, free, settings), action, { chatId, freeModelId: free.id });
  }

  /**
   * Stops a free model call when the free model calls of all users today reached the daily cap. The cap is a little
   * below the OpenRouter limit of the server key, so the users get a clear message, not a provider error.
   */
  async checkCap(user: User, settings: EnergySettings): Promise<void> {
    if ((await this.energy.freeRequestsToday()) >= settings.freeDailyCap) {
      await this.events.record("free_model_busy", { userId: user.id, reason: "cap" });
      throw new HttpException({ error: "free_model_busy" }, 503);
    }
  }

  /** Gives a spend back. It does nothing for an own model. */
  async refund(spend: EnergySpend | null): Promise<void> {
    if (spend) {
      await this.energy.refund(spend);
    }
  }

  /**
   * The error code of a failed call for the user. On a free model, a 429 or a usage limit comes from the shared
   * OpenRouter limit, so the user sees "free model is busy", and the admin overview counts an event.
   */
  async callError(code: AiErrorCode, user: User, free: FreeModel | null): Promise<AiErrorCode> {
    if (!free || !SHARED_LIMIT_ERRORS.has(code)) {
      return code;
    }
    await this.events.record("free_model_busy", { userId: user.id, reason: code });
    return "free_model_busy";
  }
}
