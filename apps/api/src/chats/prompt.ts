import { estimateTokens } from "@wanderer/shared";
import type OpenAI from "openai";

type PromptMessage = OpenAI.Chat.ChatCompletionMessageParam;

const CHOICES_COUNT = 4;
const CHOICE_MAX = 300;

const ROLEPLAY_TEXT =
  "You are {{char}} in a roleplay with {{user}}. Stay in character. Write only the reply of {{char}}. Do not write the words or actions of {{user}}.";
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
  ];
  const sections = parts
    .filter(([, body]) => body.trim().length > 0)
    .map(([heading, body]) => `## ${heading}\n${body.trim()}`);
  return fill([ROLEPLAY_TEXT, ...sections].join("\n\n"), input);
}

/** The newest messages that fit in the budget, oldest first. The newest message always goes in. */
function fitHistory(input: PromptInput, used: number): PromptMessage[] {
  const kept: PromptMessage[] = [];
  let total = used;
  for (let index = input.history.length - 1; index >= 0; index--) {
    const message = input.history[index]!;
    const content = fill(message.content, input);
    total += estimateTokens(content);
    if (kept.length > 0 && total > input.contextTokens) {
      break;
    }
    kept.unshift({ role: message.role, content });
  }
  return kept;
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
