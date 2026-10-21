import type { CharacterInput } from "./characters.js";

/** Gives a rough token count: one token for each 4 characters. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type TokenFields = Pick<CharacterInput, "title" | "chatName" | "bio" | "personality" | "scenario" | "openings" | "exampleDialogs">;

/**
 * "permanent" counts the text that goes into each prompt: the chat name (or the title), the personality, and the scenario.
 * "total" adds the bio, all openings, and the example dialogs.
 */
export function characterTokenCounts(input: TokenFields): { permanent: number; total: number } {
  const permanent = estimateTokens(input.chatName || input.title) + estimateTokens(input.personality) + estimateTokens(input.scenario);
  const openings = input.openings.reduce((sum, opening) => sum + estimateTokens(opening), 0);
  return { permanent, total: permanent + estimateTokens(input.bio) + openings + estimateTokens(input.exampleDialogs) };
}
