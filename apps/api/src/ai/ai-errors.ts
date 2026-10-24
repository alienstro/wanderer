import type { AiErrorCode } from "@wanderer/shared";
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { BlockedUrlError } from "./url-guard.js";

/** True when the error, or one of the errors in its cause chain, is a BlockedUrlError. */
export function isBlocked(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
    if (current instanceof BlockedUrlError) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function providerCode(error: APIError): string | undefined {
  const body = error.error as { code?: unknown; type?: unknown } | undefined;
  const code = error.code ?? body?.code ?? body?.type;
  return typeof code === "string" ? code : undefined;
}

/**
 * A usage limit of a provider account, such as "FreeUsageLimitError" of OpenCode. A wait of a minute does not reset it.
 * Some proxies put the provider error into the message only, so the message is the second check.
 */
const USAGE_LIMIT = /usage[\s_-]?limit/i;

function isUsageLimit(code: string | undefined, message: unknown): boolean {
  return USAGE_LIMIT.test(code ?? "") || (typeof message === "string" && USAGE_LIMIT.test(message));
}

/** The longest provider code that goes to the log. The provider sets the value, so the log limits its length. */
const PROVIDER_CODE_LOG_MAX = 100;

/** Changes an error of a proxy call into a clear error code. The code never holds the key. */
export function toAiError(error: unknown): AiErrorCode {
  if (isBlocked(error)) {
    return "blocked_url";
  }
  // An abort comes from the reply timer. A Stop of the user ends the request, so no one reads the code.
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
    return "timeout";
  }
  if (error instanceof APIConnectionError) {
    return "provider_unreachable";
  }
  if (error instanceof APIError) {
    const message = (error.error as { message?: unknown } | undefined)?.message;
    return statusToAiError(error.status, { code: providerCode(error), message });
  }
  return "provider_error";
}

/** Changes the HTTP status of a failed proxy answer into an error code. The provider code and message are optional. */
export function statusToAiError(
  status: number | undefined,
  provider: { code?: string; message?: unknown } = {},
): AiErrorCode {
  switch (status) {
    case 401:
    case 403:
      return "invalid_key";
    case 404:
      return "model_not_found";
    case 402:
      return "no_credit";
    case 429:
      if (provider.code === "insufficient_quota") {
        return "no_credit";
      }
      return isUsageLimit(provider.code, provider.message) ? "usage_limit" : "rate_limited";
    default:
      return "provider_error";
  }
}

/** The only fields of a proxy error that go to the log. The SDK error object can hold headers. */
export function aiErrorLogFields(error: unknown): {
  status: number | undefined;
  code: AiErrorCode;
  providerCode: string | undefined;
} {
  const apiError = error instanceof APIError ? error : undefined;
  return {
    status: apiError?.status,
    code: toAiError(error),
    providerCode: apiError ? providerCode(apiError)?.slice(0, PROVIDER_CODE_LOG_MAX) : undefined,
  };
}
