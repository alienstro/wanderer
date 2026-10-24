import { z } from "zod";

export const PROXY_NAME_MAX = 60;
export const PROXY_URL_MAX = 500;
export const PROXY_MODEL_MAX = 200;
export const PROXY_PROMPT_MAX = 4000;
export const PROXY_KEY_MAX = 500;
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
  "rate_limited",
  "timeout",
  "blocked_url",
  "provider_unreachable",
  "provider_error",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AI_ERROR_TEXT: Record<AiErrorCode, string> = {
  no_active_proxy: "Add a model in Settings to start chatting.",
  invalid_key: "The proxy refused the API key.",
  model_not_found: "The proxy does not know this model.",
  no_credit: "The proxy account has no credit.",
  rate_limited: "The proxy has too many requests. Try again soon.",
  timeout: "The proxy did not answer in time.",
  blocked_url: "This proxy URL is not allowed.",
  provider_unreachable: "Wanderer cannot reach the proxy.",
  provider_error: "The proxy gave an error.",
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
  apiKey: z.string().trim().min(1).max(PROXY_KEY_MAX),
});

/** An update changes only the fields that it sends. An empty or absent apiKey keeps the saved key. */
export const proxyUpdateSchema = z.object({
  name: proxyFields.name.optional(),
  baseUrl: proxyFields.baseUrl.optional(),
  appendPath: z.boolean().optional(),
  model: proxyFields.model.optional(),
  customPrompt: z.string().trim().max(PROXY_PROMPT_MAX).optional(),
  contextTokens: contextTokensSchema.optional(),
  apiKey: z.string().trim().max(PROXY_KEY_MAX).optional(),
});

export type ProxyCreate = z.infer<typeof proxyCreateSchema>;
export type ProxyUpdate = z.infer<typeof proxyUpdateSchema>;

/** A proxy as the browser sees it. It never has the key, only its last 4 characters. */
export interface ProxyView {
  id: string;
  name: string;
  baseUrl: string;
  appendPath: boolean;
  model: string;
  customPrompt: string;
  contextTokens: number;
  keyLast4: string;
  isActive: boolean;
  createdAt: string;
}

export type ProxyTestResult =
  | { ok: true; reply: string; latencyMs: number }
  | { ok: false; error: AiErrorCode; message: string };
