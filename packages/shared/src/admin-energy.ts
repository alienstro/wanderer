import { z } from "zod";
import { SCENE_MODEL_KEYS, type SceneModelKey } from "./chats.js";
import { energySchema } from "./energy.js";
import { PROXY_MODEL_MAX } from "./proxies.js";

/** The largest markup in percent. */
export const MARKUP_MAX = 1000;
/** The largest RunPod cost of one image in USD. */
export const SCENE_COST_MAX = 10;
/** The largest global daily cap of free model requests. */
export const FREE_DAILY_CAP_MAX = 1_000_000;
export const FREE_MODEL_NAME_MAX = 60;

const markupSchema = z.number().int().min(0).max(MARKUP_MAX);

/** PUT /admin/energy/settings. Each energy value can have 2 decimal places. */
export const energySettingsInputSchema = z.object({
  dailyEnergy: energySchema,
  choicesPrice: energySchema,
  memoryPrice: energySchema,
  sceneModelKey: z.enum(SCENE_MODEL_KEYS),
  /** The markup of each model with no markup of its own and no group default. */
  globalMarkupPercent: markupSchema,
  /** The group defaults. Null means the global markup. */
  textMarkupPercent: markupSchema.nullable(),
  imageMarkupPercent: markupSchema.nullable(),
  freeDailyCap: z.number().int().min(0).max(FREE_DAILY_CAP_MAX),
});

export type EnergySettingsInput = z.input<typeof energySettingsInputSchema>;

const freeModelFields = {
  displayName: z.string().trim().min(1).max(FREE_MODEL_NAME_MAX),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  /** Null means the text default of the settings. */
  markupPercent: markupSchema.nullable(),
  /** Null means the price from OpenRouter. */
  manualEnergyPrice: energySchema.nullable(),
};

/** An OpenRouter model id, such as google/gemma-4-31b-it:free. */
export const openrouterIdSchema = z.string().trim().min(1).max(PROXY_MODEL_MAX);

/** POST /admin/energy/free-models */
export const freeModelCreateSchema = z.object({
  openrouterId: openrouterIdSchema,
  displayName: freeModelFields.displayName,
  enabled: freeModelFields.enabled.default(false),
  isDefault: freeModelFields.isDefault.default(false),
  sortOrder: freeModelFields.sortOrder.default(0),
  markupPercent: freeModelFields.markupPercent.default(null),
  manualEnergyPrice: freeModelFields.manualEnergyPrice.default(null),
});

/** PATCH /admin/energy/free-models/:id. The id of OpenRouter does not change: remove the model and add a new one. */
export const freeModelUpdateSchema = z.object(freeModelFields).partial();

/** POST /admin/energy/free-models/test */
export const freeModelTestSchema = z.object({ openrouterId: openrouterIdSchema });

/** PUT /admin/energy/scene-models/:key */
export const sceneModelInputSchema = z.object({
  costUsd: z.number().min(0).max(SCENE_COST_MAX),
  markupPercent: markupSchema.nullable(),
  enabled: z.boolean(),
});

/**
 * Where the markup in use comes from: the model itself, the default of its group (text or image), or the global
 * markup. A model markup wins over the group default, and the group default wins over the global markup.
 */
export type MarkupSource = "model" | "text" | "image" | "global";

/** The energy values of the admin views are in energy, such as 0.3. The USD values are numbers, such as 0.003. */
export interface AdminEnergySettings {
  dailyEnergy: number;
  choicesPrice: number;
  memoryPrice: number;
  sceneModelKey: SceneModelKey;
  globalMarkupPercent: number;
  textMarkupPercent: number | null;
  imageMarkupPercent: number | null;
  freeDailyCap: number;
  updatedAt: string;
}

/** One row of the free model price table. */
export interface AdminFreeModel {
  id: string;
  openrouterId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  /** The USD prices for each token of the paid version. Null when OpenRouter has no paid version. */
  promptPriceUsd: number | null;
  completionPriceUsd: number | null;
  pricesFetchedAt: string | null;
  /** The markup of the model. Null means the text default. */
  ownMarkupPercent: number | null;
  /** The markup in use: the markup of the model, the text default or the global markup. */
  markupPercent: number;
  markupSource: Extract<MarkupSource, "model" | "text" | "global">;
  manualEnergyPrice: number | null;
  /** The USD cost of one reply. Null with no paid version. */
  costUsd: number | null;
  /** The energy price of one reply. Null when the model has no price, so it cannot be enabled. */
  energyPrice: number | null;
  /** The USD value of the energy price. */
  usdValue: number | null;
}

/** One RunPod image model of the price table. */
export interface AdminSceneModel {
  key: SceneModelKey;
  label: string;
  costUsd: number;
  ownMarkupPercent: number | null;
  markupPercent: number;
  markupSource: Extract<MarkupSource, "model" | "image" | "global">;
  enabled: boolean;
  /** True for the model of the settings. */
  active: boolean;
  energyPrice: number;
  usdValue: number;
}

/** GET /admin/energy */
export interface AdminEnergyView {
  settings: AdminEnergySettings;
  freeModels: AdminFreeModel[];
  sceneModels: AdminSceneModel[];
}
