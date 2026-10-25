import { z } from "zod";

export const API_KEY_NAME_MAX = 60;
export const API_KEY_MAX = 500;
/** A user can keep this number of saved API keys or less. */
export const API_KEY_LIMIT = 20;

const apiKeyFields = {
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX),
  apiKey: z.string().trim().min(1).max(API_KEY_MAX),
};

export const apiKeyCreateSchema = z.object(apiKeyFields);

/** An update changes the name, the key, or both. A body with neither is refused. */
export const apiKeyUpdateSchema = z
  .object({ name: apiKeyFields.name.optional(), apiKey: apiKeyFields.apiKey.optional() })
  .refine((body) => body.name !== undefined || body.apiKey !== undefined, {
    message: "Send a name or a key",
    path: ["name"],
  });

export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyUpdate = z.infer<typeof apiKeyUpdateSchema>;

/** The 409 body of a delete of a key that models use. The user must change those models first. */
export interface ApiKeyInUse {
  error: "api_key_in_use";
  models: string[];
}

/** A saved key as the browser sees it. It never has the key, only its last 4 characters. */
export interface ApiKeyView {
  id: string;
  name: string;
  keyLast4: string;
  /** The number of models that use this key. */
  modelCount: number;
  createdAt: string;
}
