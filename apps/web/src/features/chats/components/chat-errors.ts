import type { AiErrorCode } from "@wanderer/shared";
import { ApiError } from "@/lib/api";

// The error texts of the chat page. They live apart from the page, so the page file stays short.

/** The next step for each AI error. "settings" adds a button that opens the model page. */
export const AI_ERROR_STEP: Record<AiErrorCode, { text: string; settings?: boolean }> = {
  no_active_proxy: { text: "Add a model, then send your message again.", settings: true },
  invalid_key: { text: "Check the API key of your model in Settings.", settings: true },
  model_not_found: { text: "Check the model name in Settings.", settings: true },
  no_credit: { text: "Add credit on the proxy site, then try again." },
  usage_limit: { text: "Add credit or a plan on the proxy site, or pick a different model.", settings: true },
  rate_limited: { text: "Wait a minute, then try again." },
  timeout: { text: "Try again. If the problem continues, use a faster model." },
  blocked_url: { text: "Use a different proxy URL in Settings.", settings: true },
  provider_unreachable: { text: "Check the proxy URL in Settings, or try again later.", settings: true },
  provider_error: { text: "This problem is usually short. Try again in a moment." },
  free_model_busy: { text: "Try again in a few minutes, or pick your own model in Settings.", settings: true },
};

/** The text for an error before the stream starts, such as a busy chat or a rate limit. */
export function sendErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
  if (code === "chat_busy") {
    return "A reply is already on its way. Wait for it, then send again.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "You sent many messages in a short time. Wait a minute, then try again.";
  }
  return "The message did not send. Try again.";
}
