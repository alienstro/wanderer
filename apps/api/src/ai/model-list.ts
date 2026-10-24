import { PROXY_MODEL_MAX, PROXY_MODELS_LIMIT, type ProxyModelsError } from "@wanderer/shared";
import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";
import { isBlocked, statusToAiError } from "./ai-errors.js";
import { assertProxyUrl, createGuardedLookup } from "./url-guard.js";

export const MODEL_LIST_TIMEOUT_MS = 10_000;
/** The API reads this number of bytes of the answer or less. The OpenRouter list is about 800 KB. */
export const MODEL_LIST_MAX_BYTES = 4 * 1024 * 1024;

/** A failed model list. The code never holds the key. */
export class ModelListError extends Error {
  constructor(readonly code: ProxyModelsError) {
    super(`The model list failed: ${code}`);
    this.name = "ModelListError";
  }
}

export interface ModelListClient {
  /** Gives the model ids at the URL. It throws ModelListError for each failure. */
  list(url: string, apiKey: string): Promise<string[]>;
}

/** The Nest injection token for the ModelListClient. */
export const MODEL_LIST_CLIENT = Symbol("MODEL_LIST_CLIENT");

/** The URL of the model list of a proxy, such as https://openrouter.ai/api/v1/models. */
export function modelsUrl(baseUrl: string): string {
  return `${baseUrl}/models`;
}

/**
 * Keeps the id strings of an OpenAI-compatible list `{ data: [{ id }] }`, sorted and with no duplicates.
 * It drops an empty id and an id that is too long for the Model field.
 */
export function modelIds(body: unknown): string[] {
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) {
    throw new ModelListError("no_model_list");
  }
  const ids = new Set<string>();
  for (const item of data) {
    const id = typeof item === "object" && item !== null ? (item as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id.trim() !== "" && id.length <= PROXY_MODEL_MAX) {
      ids.add(id.trim());
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b)).slice(0, PROXY_MODELS_LIMIT);
}

/** Reads the body as text, and stops when it is larger than MODEL_LIST_MAX_BYTES. */
async function readCapped(res: Awaited<ReturnType<typeof undiciFetch>>): Promise<string> {
  if (Number(res.headers.get("content-length")) > MODEL_LIST_MAX_BYTES) {
    await res.body?.cancel();
    throw new ModelListError("no_model_list");
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of res.body ?? []) {
    size += part.byteLength;
    if (size > MODEL_LIST_MAX_BYTES) {
      throw new ModelListError("no_model_list");
    }
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

function networkError(error: unknown): ModelListError {
  if (isBlocked(error)) {
    return new ModelListError("blocked_url");
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new ModelListError("timeout");
  }
  return new ModelListError("provider_unreachable");
}

/** Gets the model list at the URL. A 404 or 405 means that the proxy has no list. */
export async function fetchModelIds(
  url: string,
  apiKey: string,
  transport: { fetch: typeof undiciFetch; dispatcher?: Dispatcher },
): Promise<string[]> {
  const { fetch, dispatcher } = transport;
  let text: string;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
      dispatcher,
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new ModelListError(res.status === 404 || res.status === 405 ? "no_model_list" : statusToAiError(res.status));
    }
    text = await readCapped(res);
  } catch (error) {
    throw error instanceof ModelListError ? error : networkError(error);
  }
  try {
    return modelIds(JSON.parse(text));
  } catch (error) {
    throw error instanceof ModelListError ? error : new ModelListError("no_model_list");
  }
}

/** The real client. It has the same SSRF guard as the chat client: a URL check and a DNS check. */
export class GuardedModelListClient implements ModelListClient {
  private readonly agent: Agent;

  constructor(resolve?: Parameters<typeof createGuardedLookup>[0]) {
    this.agent = new Agent({ connect: { lookup: createGuardedLookup(resolve) } });
  }

  list(url: string, apiKey: string): Promise<string[]> {
    assertProxyUrl(url);
    return fetchModelIds(url, apiKey, { fetch: undiciFetch, dispatcher: this.agent });
  }
}
