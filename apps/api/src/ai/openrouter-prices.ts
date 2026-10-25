import { fetch as undiciFetch } from "undici";
import { MODEL_LIST_TIMEOUT_MS, ModelListError, readCapped } from "./model-list.js";

/** The public model list of OpenRouter. It needs no key. */
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** The USD prices of a model for each token. */
export interface ModelPrice {
  prompt: number;
  completion: number;
}

export interface OpenRouterPricesClient {
  /** Gives the prices of each model id. It throws ModelListError for each failure. */
  list(): Promise<Map<string, ModelPrice>>;
}

/** The Nest injection token for the OpenRouterPricesClient. */
export const OPENROUTER_PRICES_CLIENT = Symbol("OPENROUTER_PRICES_CLIENT");

/** The id of the paid version of a free model: the same id with no ":free". */
export function paidId(openrouterId: string): string {
  return openrouterId.replace(/:free$/, "");
}

function price(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Reads `{ data: [{ id, pricing: { prompt, completion } }] }`. It drops an item with no valid prices. */
export function parsePrices(body: unknown): Map<string, ModelPrice> {
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) {
    throw new ModelListError("no_model_list");
  }
  const prices = new Map<string, ModelPrice>();
  for (const item of data as Array<{ id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }>) {
    const prompt = price(item?.pricing?.prompt);
    const completion = price(item?.pricing?.completion);
    if (typeof item?.id === "string" && prompt !== null && completion !== null) {
      prices.set(item.id, { prompt, completion });
    }
  }
  return prices;
}

/** Reads the OpenRouter list. The URL is fixed, so no user value goes into the request. */
export class FetchOpenRouterPricesClient implements OpenRouterPricesClient {
  constructor(private readonly fetch: typeof undiciFetch = undiciFetch) {}

  async list(): Promise<Map<string, ModelPrice>> {
    let text: string;
    try {
      const res = await this.fetch(OPENROUTER_MODELS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
      });
      if (!res.ok) {
        await res.body?.cancel();
        throw new ModelListError("provider_error");
      }
      text = await readCapped(res);
    } catch (error) {
      throw error instanceof ModelListError ? error : new ModelListError("provider_unreachable");
    }
    try {
      return parsePrices(JSON.parse(text));
    } catch (error) {
      throw error instanceof ModelListError ? error : new ModelListError("no_model_list");
    }
  }
}
