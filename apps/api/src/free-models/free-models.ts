import { energyPrice, type MarkupSource, textReplyCostUsd } from "@wanderer/shared";
import type { EnergySettings, FreeModel } from "../generated/prisma/client.js";

/** The chat completions endpoint of OpenRouter. The free models use only this endpoint. */
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** The markup of a text model: its own markup, else the text default, else the global markup. */
export function textMarkup(
  model: FreeModel,
  settings: EnergySettings,
): { percent: number; source: Extract<MarkupSource, "model" | "text" | "global"> } {
  if (model.markupPercent !== null) {
    return { percent: model.markupPercent, source: "model" };
  }
  if (settings.textMarkupPercent !== null) {
    return { percent: settings.textMarkupPercent, source: "text" };
  }
  return { percent: settings.globalMarkupPercent, source: "global" };
}

/**
 * The energy price of one reply in hundredths. A manual price wins. Else the price comes from the OpenRouter prices
 * of the paid version, with the markup of textMarkup. Null when the model has no price.
 */
export function textEnergyPrice(model: FreeModel, settings: EnergySettings): number | null {
  if (model.manualEnergyPrice !== null) {
    return model.manualEnergyPrice;
  }
  if (model.promptPriceUsd === null || model.completionPriceUsd === null) {
    return null;
  }
  const cost = textReplyCostUsd(model.promptPriceUsd.toNumber(), model.completionPriceUsd.toNumber());
  return energyPrice(cost, textMarkup(model, settings).percent);
}

/** True when users can chat with the model: it is on and it has a price. */
export function isUsable(model: FreeModel, settings: EnergySettings): boolean {
  return model.enabled && textEnergyPrice(model, settings) !== null;
}

/** The model of a user: the picked model when it is usable, else the default model when it is usable. */
export function chooseFreeModel(models: FreeModel[], pickedId: string | null, settings: EnergySettings): FreeModel | null {
  const usable = models.filter((model) => isUsable(model, settings));
  return usable.find((model) => model.id === pickedId) ?? usable.find((model) => model.isDefault) ?? null;
}
