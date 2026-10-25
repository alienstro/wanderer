import { z } from "zod";
import { API_KEY_MAX } from "../api-keys/index.js";

export const PROXY_NAME_MAX = 60;
export const PROXY_URL_MAX = 500;
export const PROXY_MODEL_MAX = 200;
export const PROXY_PROMPT_MAX = 4000;
/** The chat history budget of a proxy, in estimated tokens. The system message always goes in. */
export const PROXY_CONTEXT_MIN = 2_000;
export const PROXY_CONTEXT_MAX = 200_000;
export const PROXY_CONTEXT_DEFAULT = 16_000;
/** A user can keep this number of proxies or less. */
export const PROXY_LIMIT = 20;

/** The error codes for a failed call to a proxy. The text of each code is in AI_ERROR_TEXT. */
export const AI_ERROR_CODES = [
  "no_active_proxy",
  "invalid_key",
  "model_not_found",
  "no_credit",
  "usage_limit",
  "rate_limited",
  "timeout",
  "blocked_url",
  "provider_unreachable",
  "provider_error",
  "free_model_busy",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AI_ERROR_TEXT: Record<AiErrorCode, string> = {
  no_active_proxy: "Add a model in Settings to start chatting.",
  invalid_key: "The proxy refused the API key.",
  model_not_found: "The proxy does not know this model.",
  no_credit: "The proxy account has no credit.",
  usage_limit: "The proxy account reached its usage limit.",
  rate_limited: "The proxy has too many requests. Try again soon.",
  timeout: "The proxy did not answer in time.",
  blocked_url: "This proxy URL is not allowed.",
  provider_unreachable: "Wanderer cannot reach the proxy.",
  provider_error: "The proxy gave an error.",
  free_model_busy: "The free model is busy.",
};

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && (AI_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * A proxy URL: https only, with no user name, no password, and no "#". The schema removes the trailing "/".
 * The API checks the host again before each call (the SSRF guard).
 */
export const proxyUrlSchema = z
  .string()
  .trim()
  .max(PROXY_URL_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !value.includes("#");
    } catch {
      return false;
    }
  }, "The proxy URL must be an https URL")
  .transform((value) => value.replace(/\/+$/, ""));

const contextTokensSchema = z.number().int().min(PROXY_CONTEXT_MIN).max(PROXY_CONTEXT_MAX);

const proxyFields = {
  name: z.string().trim().min(1).max(PROXY_NAME_MAX),
  baseUrl: proxyUrlSchema,
  appendPath: z.boolean().default(true),
  model: z.string().trim().min(1).max(PROXY_MODEL_MAX),
  customPrompt: z.string().trim().max(PROXY_PROMPT_MAX).default(""),
  contextTokens: contextTokensSchema.default(PROXY_CONTEXT_DEFAULT),
};

export const proxyCreateSchema = z.object({
  ...proxyFields,
  apiKeyId: z.uuid(),
});

/** An update changes only the fields that it sends. An absent apiKeyId keeps the current key. */
export const proxyUpdateSchema = z.object({
  name: proxyFields.name.optional(),
  baseUrl: proxyFields.baseUrl.optional(),
  appendPath: z.boolean().optional(),
  model: proxyFields.model.optional(),
  customPrompt: z.string().trim().max(PROXY_PROMPT_MAX).optional(),
  contextTokens: contextTokensSchema.optional(),
  apiKeyId: z.uuid().optional(),
});

export type ProxyCreate = z.infer<typeof proxyCreateSchema>;
export type ProxyUpdate = z.infer<typeof proxyUpdateSchema>;

/** A proxy as the browser sees it. It never has the key, only the name and the last 4 characters of its saved key. */
export interface ProxyView {
  id: string;
  name: string;
  baseUrl: string;
  appendPath: boolean;
  model: string;
  customPrompt: string;
  contextTokens: number;
  savedKey: { id: string; name: string; keyLast4: string };
  isActive: boolean;
  createdAt: string;
}

export type ProxyTestResult =
  | { ok: true; reply: string; latencyMs: number }
  | { ok: false; error: AiErrorCode; message: string };

/** The model list gives this number of model ids or less. */
export const PROXY_MODELS_LIMIT = 2_000;

/** The error codes for a failed model list. "no_model_list" means that the proxy URL has no list. */
export type ProxyModelsError = AiErrorCode | "no_model_list";

export const PROXY_MODELS_ERROR_TEXT: Record<ProxyModelsError, string> = {
  ...AI_ERROR_TEXT,
  no_model_list: "This proxy URL has no model list. Type the model id.",
};

/**
 * The body of POST /proxies/models. The API uses apiKey when it is not empty. Otherwise it uses the saved key
 * with apiKeyId.
 */
export const proxyModelsSchema = z
  .object({
    baseUrl: proxyUrlSchema,
    appendPath: z.boolean().default(true),
    apiKey: z.string().trim().max(API_KEY_MAX).default(""),
    apiKeyId: z.string().optional(),
  })
  .refine((body) => body.apiKey !== "" || body.apiKeyId !== undefined, {
    message: "Send an API key or a saved key",
    path: ["apiKey"],
  });

export type ProxyModelsRequest = z.input<typeof proxyModelsSchema>;

export type ProxyModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: ProxyModelsError; message: string };
