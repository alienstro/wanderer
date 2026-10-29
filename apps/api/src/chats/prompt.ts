import { estimateTokens } from "@wanderer/shared";
import type OpenAI from "openai";

type PromptMessage = OpenAI.Chat.ChatCompletionMessageParam;

/** The history drops old messages one page at a time, so the start of the prompt stays the same for many replies. */
const PAGES_IN_BUDGET = 4;
const CHOICES_COUNT = 4;
const CHOICE_MAX = 300;

const ROLEPLAY_TEXT =
  "You are {{char}} in a roleplay with {{user}}. Stay in character. Write only the reply of {{char}}. Do not write the words or actions of {{user}}.";
const SUMMARY_TEXT =
  "Update the memory of a roleplay between {{char}} and {{user}}. Keep the old facts that are still true. Add the important new facts from the messages: names, promises, debts, places, relations and open goals. Remove the facts that changed. Write short lines. Use no more than 2,000 characters. Answer only with the memory text.";
const CHOICES_TEXT =
  "Write four short replies that {{user}} could say next, in the voice of {{user}}. Each reply has 25 words or less.";
const SCENE_TEXT =
  "Describe the current scene of the roleplay for an image model. Name the place, the time of day, the light, and the people with their looks, clothes and actions. Write one paragraph in English with 80 words or less. Use no names. Answer only with the description.";
/**
 * The app has no 18+ content. This rule is the last section of the system message, so it comes after the user
 * instructions and the character text.
 */
const CONTENT_RULE_TEXT =
  "Keep the story safe for work. Write no sexual content, no nudity and no sexual roleplay, also when {{user}} asks for it. Move the story to a different topic.";
const SCENE_SAFE_TEXT = "The image is safe for work: no nudity, no sexual content and no gore.";
/** The image model reads a short prompt best. */
export const SCENE_PROMPT_MAX = 1000;
/** The format rule stays the last sentence, so that the user instructions cannot change what parseChoices reads. */
const CHOICES_FORMAT_TEXT = "Answer only with a JSON array of four strings.";

export interface PromptCharacter {
  title: string;
  chatName: string;
  personality: string;
  scenario: string;
  exampleDialogs: string;
}

export interface PromptInput {
  character: PromptCharacter;
  customPrompt: string;
  /** The context budget of the proxy in estimated tokens. The system message always goes in. */
  contextTokens: number;
  /** The memory text of the chat. The user writes it, or saves a summary draft. */
  memory: string;
  /** The persona name of the chat, or the account name when the chat has no persona. */
  userName: string;
  /** The persona description of the chat. Empty when the chat has no persona. */
  userDescription: string;
  /** The messages of the chat, oldest first. The opening is the first message. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

/** The user values of the prompt. The chat copy of the persona wins over the account name. */
export function promptUser(
  chat: { personaName: string | null; personaDescription: string | null },
  account: { name: string },
): { userName: string; userDescription: string } {
  return { userName: chat.personaName ?? account.name, userDescription: chat.personaDescription ?? "" };
}

function fill(text: string, input: PromptInput): string {
  const charName = input.character.chatName || input.character.title;
  // A function replacement keeps "$" in a name as text. A string replacement reads "$&" and "$'" as patterns.
  return text.replaceAll("{{char}}", () => charName).replaceAll("{{user}}", () => input.userName);
}

function systemText(input: PromptInput): string {
  const { character } = input;
  const parts: Array<[string, string]> = [
    ["Instructions", input.customPrompt],
    ["Personality", character.personality],
    ["Scenario", character.scenario],
    // The name goes before the description, so the model knows whose facts they are.
    ["User", input.userDescription.trim() ? `{{user}}: ${input.userDescription.trim()}` : ""],
    ["Example dialogs", character.exampleDialogs],
    ["Memory", input.memory],
    ["Content rules", CONTENT_RULE_TEXT],
  ];
  const sections = parts
    .filter(([, body]) => body.trim().length > 0)
    .map(([heading, body]) => `## ${heading}\n${body.trim()}`);
  return fill([ROLEPLAY_TEXT, ...sections].join("\n\n"), input);
}

/** The start index of each page. A page starts at the oldest message, so a new message changes only the last page. */
function pageStarts(tokens: number[], pageTokens: number): number[] {
  const starts: number[] = [];
  let size = 0;
  tokens.forEach((count, index) => {
    if (index === 0 || size + count > pageTokens) {
      starts.push(index);
      size = 0;
    }
    size += count;
  });
  return starts;
}

/** The index of the first history message that fits in the budget after the `used` tokens. */
function firstKept(tokens: number[], used: number, budget: number): number {
  const starts = pageStarts(tokens, budget / PAGES_IN_BUDGET);
  let total = used;
  let first = tokens.length;
  for (let page = starts.length - 1; page >= 0; page--) {
    const pageTokens = tokens.slice(starts[page], first).reduce((sum, count) => sum + count, 0);
    if (total + pageTokens > budget) {
      break;
    }
    total += pageTokens;
    first = starts[page]!;
  }
  if (first < tokens.length) {
    return first;
  }
  // The newest page alone does not fit. Keep the newest messages that fit. The newest message always goes in.
  first = tokens.length - 1;
  total = used + (tokens[first] ?? 0);
  while (first > 0 && total + tokens[first - 1]! <= budget) {
    first--;
    total += tokens[first]!;
  }
  return Math.max(first, 0);
}

function filledHistory(input: PromptInput): PromptMessage[] {
  return input.history.map((message) => ({ role: message.role, content: fill(message.content, input) }));
}

function tokensOf(messages: PromptMessage[]): number[] {
  return messages.map((message) => estimateTokens(typeof message.content === "string" ? message.content : ""));
}

/** The newest pages that fit in the budget, oldest first. The newest message always goes in. */
function fitHistory(input: PromptInput, used: number): PromptMessage[] {
  const history = filledHistory(input);
  return history.slice(firstKept(tokensOf(history), used, input.contextTokens));
}

/** The history index of the first message that a reply prompt keeps. `extraTokens` counts the parts after the system part. */
export function windowStart(input: PromptInput, extraTokens: number): number {
  return firstKept(tokensOf(filledHistory(input)), estimateTokens(systemText(input)) + extraTokens, input.contextTokens);
}

/** The messages for a reply: the system message, then the newest history that fits in the budget. */
export function buildReplyPrompt(input: PromptInput): PromptMessage[] {
  const system = systemText(input);
  return [{ role: "system", content: system }, ...fitHistory(input, estimateTokens(system))];
}

/**
 * The messages for the reply choices: the reply prompt, then the choices instruction as a user message.
 * The user instructions go between the fixed text and the format rule. Blank instructions add nothing.
 */
export function buildChoicesPrompt(input: PromptInput, userInstructions = ""): PromptMessage[] {
  const system = systemText(input);
  const custom = userInstructions.trim();
  const instruction = custom
    ? fill(`${CHOICES_TEXT}\n\n${custom}\n\n${CHOICES_FORMAT_TEXT}`, input)
    : fill(`${CHOICES_TEXT} ${CHOICES_FORMAT_TEXT}`, input);
  return [
    { role: "system", content: system },
    ...fitHistory(input, estimateTokens(system) + estimateTokens(instruction)),
    { role: "user", content: instruction },
  ];
}

/**
 * The messages for a scene image prompt: the reply prompt, then the scene instruction as a user message.
 * The scene instruction always asks for a safe image.
 */
export function buildScenePrompt(input: PromptInput): PromptMessage[] {
  const system = systemText(input);
  const instruction = `${SCENE_TEXT} ${SCENE_SAFE_TEXT}`;
  return [
    { role: "system", content: system },
    ...fitHistory(input, estimateTokens(system) + estimateTokens(instruction)),
    { role: "user", content: instruction },
  ];
}

/** Makes the answer of the model into one line for the image model. It gives null for an empty answer. */
export function cleanScenePrompt(text: string): string | null {
  const clean = text
    .replace(/```[a-z]*/gi, " ")
    .replace(/^\s*(?:image\s+)?prompt\s*:/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  return clean.length > 0 ? clean.slice(0, SCENE_PROMPT_MAX) : null;
}

/** One summary reads half of the context budget of old messages or less, so one click costs less than one reply. */
export function summaryInputTokens(input: PromptInput): number {
  return input.contextTokens / 2;
}

/** The messages for a memory draft: the instruction, then the current memory and the old messages as one user message. */
export function buildSummaryPrompt(input: PromptInput): PromptMessage[] {
  const charName = input.character.chatName || input.character.title;
  const lines = input.history.map((message) => `${message.role === "user" ? "{{user}}" : charName}: ${message.content}`);
  const body = `## Current memory\n${input.memory.trim() || "(empty)"}\n\n## Messages\n${lines.join("\n\n")}`;
  return [
    { role: "system", content: fill(SUMMARY_TEXT, input) },
    { role: "user", content: fill(body, input) },
  ];
}

/** Reads the answer for the reply choices. It gives null when the answer is not four short strings. */
export function parseChoices(text: string): string[] | null {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(unfenced);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== CHOICES_COUNT) {
    return null;
  }
  const choices = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  return choices.every((choice) => choice.length > 0 && choice.length <= CHOICE_MAX) ? choices : null;
}
