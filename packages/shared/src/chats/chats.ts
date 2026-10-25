import { z } from "zod";
import { OPENINGS_MAX } from "../characters/index.js";
import type { AiErrorCode } from "../proxies/index.js";

export const MESSAGE_MAX = 8000;
/** The sidebar and the banner show this number of characters of the last message, or less. */
export const LAST_MESSAGE_MAX = 140;
/** The memory of a chat keeps facts after their messages leave the history window. */
export const MEMORY_MAX = 2000;
/** The RunPod image models that the API has an adapter for. Each scene image costs energy. */
export const SCENE_MODEL_KEYS = ["flux-schnell", "z-image-turbo"] as const;
export type SceneModelKey = (typeof SCENE_MODEL_KEYS)[number];
export const SCENE_MODEL_LABELS: Record<SceneModelKey, string> = {
  "flux-schnell": "Flux Schnell",
  "z-image-turbo": "Z-Image Turbo",
};

const openingIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(OPENINGS_MAX - 1);

/** A new chat starts with opening 0 when the body has no `openingIndex`. */
export const createChatSchema = z.object({
  characterId: z.uuid(),
  openingIndex: openingIndexSchema.default(0),
});

/** The user changes the opening of a chat until the first user message. */
export const openingInputSchema = z.object({
  openingIndex: openingIndexSchema,
});

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX),
});

/** `throughPosition` comes from a summary draft. The web sends it only when the text comes from a draft. */
export const memoryInputSchema = z.object({
  memory: z.string().trim().max(MEMORY_MAX),
  throughPosition: z.number().int().min(0).nullable().optional(),
});

/** The panel sends its unsaved text and draft marker, so a summary does not lose them. Each field is optional. */
export const memoryDraftInputSchema = memoryInputSchema.partial();

export type CreateChat = z.infer<typeof createChatSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export type OpeningInput = z.infer<typeof openingInputSchema>;

export interface ChatMemory {
  text: string;
  /** The last message position that the saved memory covers. Null when no summary is saved. */
  throughPosition: number | null;
}

/** A summary draft. The API does not save it. */
export interface MemoryDraftResponse {
  memory: string;
  throughPosition: number | null;
}

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
  /** The number of messages in the chat, with the opening. */
  messageCount: number;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: MessageView[];
  memory: ChatMemory;
  /** False when the character is now private or blocked for the user. The user can read but not send. */
  canSend: boolean;
  /** The opening that message 0 holds, and the number of openings that the character has now. */
  opening: { index: number; count: number };
  /** The scene images of the chat, oldest first. */
  scenes: SceneView[];
  /** The persona name that the chat copied when it started. Null when the user had no persona. */
  personaName: string | null;
}

/** One scene image. The chat shows it after the message at `afterPosition`. */
export interface SceneView {
  id: string;
  url: string;
  afterPosition: number;
  createdAt: string;
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
