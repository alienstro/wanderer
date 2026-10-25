import { z } from "zod";

/** A user can keep this number of personas or less. */
export const PERSONA_LIMIT = 3;
export const PERSONA_NAME_MAX = 50;
/** The description goes into each prompt, so it stays smaller than the chat memory. */
export const PERSONA_DESCRIPTION_MAX = 1000;

/** The body of a create and of an edit. The edit sends both fields. */
export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(PERSONA_NAME_MAX),
  description: z.string().trim().max(PERSONA_DESCRIPTION_MAX).default(""),
});
export type PersonaInput = z.infer<typeof personaInputSchema>;

/** One persona of the user, as the API sends it. */
export interface Persona {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The personas of the user, oldest first. */
export interface PersonaListResponse {
  personas: Persona[];
}
