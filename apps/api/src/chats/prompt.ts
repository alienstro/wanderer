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
  "Write four short replies that {{user}} could say next, in the voice of {{user}}. Each reply has 25 words or less. Answer only with a JSON array of four strings.";

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
  userName: string;
  /** The messages of the chat, oldest first. The opening is the first message. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
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
    ["Example dialogs", character.exampleDialogs],
    ["Memory", input.memory],
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

/** The messages for the reply choices: the reply prompt, then the choices instruction as a user message. */
export function buildChoicesPrompt(input: PromptInput): PromptMessage[] {
  const system = systemText(input);
  const instruction = fill(CHOICES_TEXT, input);
  return [
    { role: "system", content: system },
    ...fitHistory(input, estimateTokens(system) + estimateTokens(instruction)),
    { role: "user", content: instruction },
  ];
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
