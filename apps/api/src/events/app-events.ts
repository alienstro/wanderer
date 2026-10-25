import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { AppEventType, Prisma } from "../generated/prisma/client.js";

export interface EventFields {
  userId?: string;
  characterId?: string;
  /** A short, safe code, such as an AI error code. Never prompt text, message text, keys or URLs. */
  reason?: string;
  /** The old and the new value of an admin change. Never a key. */
  details?: Prisma.InputJsonValue;
}

/**
 * The name of the event that a module sends for each app event type. The events module listens and saves a row,
 * which the admin overview counts. docs/architecture.md has the event list.
 */
export const APP_EVENTS = {
  login: "auth.login",
  ai_reply_failed: "chat.reply_failed",
  choices_failed: "chat.choices_failed",
  summary_failed: "chat.summary_failed",
  proxy_test_failed: "proxy.test_failed",
  model_list_failed: "proxy.model_list_failed",
  energy_too_low: "energy.too_low",
  free_model_busy: "free_model.busy",
  admin_change: "admin.changed",
} as const satisfies Record<AppEventType, string>;

/**
 * Sends an app event and waits for the listeners, so the row is saved before the response, as before the events.
 * A failed save goes to the log only. It never stops the request of the user.
 */
export async function sendAppEvent(emitter: EventEmitter2, type: AppEventType, fields: EventFields = {}): Promise<void> {
  await emitter.emitAsync(APP_EVENTS[type], fields);
}
