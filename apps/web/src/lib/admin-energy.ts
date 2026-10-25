import type { AdminEnergySettings, EnergySettingsInput, MarkupSource } from "@wanderer/shared";
import { ApiError, apiFetch } from "./api";

/** The query key of GET /admin/energy. Each change on the page loads it again. */
export const ADMIN_ENERGY_KEY = ["admin-energy"];

/** The plain text of each error code of the admin energy endpoints. */
const ERROR_TEXT: Record<string, string> = {
  price_required: "This model has no OpenRouter price. Type a manual price, or keep the model off.",
  model_exists: "This model is already on the list.",
  invalid_energy: "Check the values. A price can have 2 decimal places or less, and no value can be below 0.",
  not_found: "This model is no longer on the list.",
  no_server_key: "The server has no OpenRouter key, so the free models are off.",
  scene_model_active: "The active scene model cannot turn off. Pick another scene image model in the settings first.",
  scene_model_off: "This scene image model is off. Turn it on first.",
  price_refresh_failed: "The prices did not load from OpenRouter. Each model keeps its last price.",
};

/** The text for a failed admin request. An unknown error gives the fallback text. */
export function adminErrorText(error: unknown, fallback: string): string {
  return (error instanceof ApiError && error.code && ERROR_TEXT[error.code]) || fallback;
}

/** The value of an optional number field: an empty field is null. NaN means that the text is not a number. */
export function optionalNumber(text: string): number | null {
  return text.trim() === "" ? null : Number(text);
}

const usdFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 10 });

/** A USD value with all its digits, such as $0.00336. A small price never shows as 3.36e-3. */
export function formatUsd(value: number): string {
  return `$${usdFormat.format(value)}`;
}

/** The short name of the place that the markup in use comes from. */
export const MARKUP_SOURCE_TEXT: Record<MarkupSource, string> = {
  model: "own",
  text: "text default",
  image: "image default",
  global: "global",
};

/** The fields of PUT /admin/energy/settings. Each form sends the saved values with its own changes. */
export function settingsBody(settings: AdminEnergySettings, changes: Partial<EnergySettingsInput> = {}): EnergySettingsInput {
  const { dailyEnergy, choicesPrice, memoryPrice, sceneModelKey, globalMarkupPercent, textMarkupPercent, imageMarkupPercent, freeDailyCap } =
    settings;
  return {
    dailyEnergy,
    choicesPrice,
    memoryPrice,
    sceneModelKey,
    globalMarkupPercent,
    textMarkupPercent,
    imageMarkupPercent,
    freeDailyCap,
    ...changes,
  };
}

/** Saves the settings: the saved values with the changes of one form or one control. */
export function putSettings(settings: AdminEnergySettings, changes: Partial<EnergySettingsInput>): Promise<unknown> {
  return apiFetch("/admin/energy/settings", { method: "PUT", body: JSON.stringify(settingsBody(settings, changes)) });
}
