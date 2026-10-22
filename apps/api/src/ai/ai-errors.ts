import type { AiErrorCode } from "@wanderer/shared";
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { BlockedUrlError } from "./url-guard.js";

/** True when the error, or one of the errors in its cause chain, is a BlockedUrlError. */
function isBlocked(error: unknown): boolean {
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
    switch (error.status) {
      case 401:
      case 403:
        return "invalid_key";
      case 404:
        return "model_not_found";
      case 402:
        return "no_credit";
      case 429:
        return providerCode(error) === "insufficient_quota" ? "no_credit" : "rate_limited";
      default:
        return "provider_error";
    }
  }
  return "provider_error";
}

/** The only fields of a proxy error that go to the log. The SDK error object can hold headers. */
export function aiErrorLogFields(error: unknown): { status: number | undefined; code: AiErrorCode } {
  return { status: error instanceof APIError ? error.status : undefined, code: toAiError(error) };
}
