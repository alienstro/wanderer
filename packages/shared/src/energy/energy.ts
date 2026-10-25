import { z } from "zod";

/**
 * Energy is the balance that a user spends on actions with a server key. The API stores each energy value as an
 * integer number of hundredths, so 0.5 energy is 50. Only the API edge and the display use decimals.
 */

/** The USD value of 1 energy. 1 hundredth is $0.0001. */
export const ENERGY_USD = 0.01;
/** The USD value of the smallest energy step, 0.01 energy. */
const HUNDREDTH_USD = ENERGY_USD / 100;
/** The largest energy value that an admin can type. */
export const ENERGY_MAX = 1_000_000;
/** The token counts of one usual reply: the full context and a usual reply length. */
export const REPLY_PROMPT_TOKENS = 16_000;
export const REPLY_COMPLETION_TOKENS = 400;

/** The decimal places of a float result that are noise, such as 30.000000000000004. */
const FLOAT_PLACES = 6;

/** True when the value has 2 decimal places or less. */
function hasTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** An energy value from a request, such as 0.5 or 99.75. The output is in hundredths. */
export const energySchema = z
  .number()
  .min(0)
  .max(ENERGY_MAX)
  .refine(hasTwoDecimals, "Use 2 decimal places or less")
  .transform((value) => Math.round(value * 100));

/** A change of energy that can be below 0, such as -5.5 to take energy away. The output is in hundredths. */
export const signedEnergySchema = z
  .number()
  .min(-ENERGY_MAX)
  .max(ENERGY_MAX)
  .refine(hasTwoDecimals, "Use 2 decimal places or less")
  .transform((value) => Math.round(value * 100));

/** Hundredths as energy, such as 9950 → 99.5. JSON shows it with no trailing zeros. */
export function toEnergy(hundredths: number): number {
  return hundredths / 100;
}

/** The USD value of an energy price in hundredths, such as 30 → 0.003. */
export function energyUsdValue(hundredths: number): number {
  return Number((hundredths * HUNDREDTH_USD).toFixed(FLOAT_PLACES + 4));
}

/** The USD cost of one usual reply on a model with these prices for each token. */
export function textReplyCostUsd(promptUsd: number, completionUsd: number): number {
  return REPLY_PROMPT_TOKENS * promptUsd + REPLY_COMPLETION_TOKENS * completionUsd;
}

/** The energy price in hundredths: cost × (1 + markup), rounded up to the next hundredth. */
export function energyPrice(costUsd: number, markupPercent: number): number {
  const hundredths = (costUsd * (100 + markupPercent)) / 100 / HUNDREDTH_USD;
  return Math.ceil(Number(hundredths.toFixed(FLOAT_PLACES)));
}

/** GET /energy: the balance of the user and the price of each action, in energy. */
export interface EnergyView {
  balance: number;
  dailyEnergy: number;
  /** The next refill time, 00:00 UTC. */
  nextRefillAt: string;
  /** The text model of the user: an own model, a free model, or none. */
  model: "own" | "free" | null;
  /** The display name of the free model. It is null when the model is not "free". */
  freeModelName: string | null;
  /** The text prices are 0 on an own model. The scene price is the same for each user. */
  prices: { reply: number; choices: number; memory: number; scene: number };
}

/** GET /free-models: one free model that a user can pick. */
export interface FreeModelView {
  id: string;
  displayName: string;
  /** The energy price of one reply. */
  energyPrice: number;
  isDefault: boolean;
  /** True for the model that the next reply of the user uses. */
  isActive: boolean;
}
