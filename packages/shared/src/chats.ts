import { z } from "zod";
import { OPENINGS_MAX } from "./characters.js";
import type { AiErrorCode } from "./proxies.js";

export const MESSAGE_MAX = 8000;
/** The sidebar and the banner show this number of characters of the last message, or less. */
export const LAST_MESSAGE_MAX = 140;

export const createChatSchema = z.object({
  characterId: z.uuid(),
  openingIndex: z
    .number()
    .int()
    .min(0)
    .max(OPENINGS_MAX - 1),
});

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX),
});

export type CreateChat = z.infer<typeof createChatSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  position: number;
  editedAt: string | null;
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  character: { id: string; title: string; chatName: string; avatarUrl: string | null };
  lastMessage: string;
  lastMessageAt: string;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: MessageView[];
  /** False when the character is now private or blocked for the user. The user can read but not send. */
  canSend: boolean;
}

export interface ChatListResponse {
  items: ChatSummary[];
}

export interface ChoicesResponse {
  choices: string[];
}

/** One event of the reply stream. The API sends each event as one SSE `data:` line with JSON. */
export type ChatStreamEvent =
  | { type: "start"; userMessage: MessageView | null }
  | { type: "delta"; text: string }
  | { type: "done"; message: MessageView }
  | { type: "error"; error: AiErrorCode; message: MessageView | null };
