import { describe, expect, it } from "vitest";
import { buildChoicesPrompt, buildReplyPrompt, parseChoices, type PromptInput } from "./prompt.js";

function input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    character: {
      title: "Onnit",
      chatName: "",
      personality: "{{char}} is cheerful and loves {{user}}.",
      scenario: "",
      exampleDialogs: "{{user}}: Hi\n{{char}}: Hello!",
    },
    customPrompt: "Write short replies.",
    userName: "Robin",
    history: [
      { role: "assistant", content: "*waves* Hi, {{user}}!" },
      { role: "user", content: "Hello {{char}}." },
    ],
    ...overrides,
  };
}

function text(content: unknown): string {
  return typeof content === "string" ? content : "";
}

describe("buildReplyPrompt", () => {
  it("the system message has the roleplay text, then the parts in order, and leaves out an empty part", () => {
    const [system] = buildReplyPrompt(input());
    const content = text(system?.content);
    expect(system?.role).toBe("system");
    expect(content.startsWith("You are Onnit in a roleplay with Robin. Stay in character.")).toBe(true);
    const order = ["## Instructions", "## Personality", "## Example dialogs"].map((h) => content.indexOf(h));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(content).not.toContain("## Scenario");
  });

  it("{{char}} becomes the chat name, or the title when the chat name is empty, and {{user}} the user name", () => {
    const messages = buildReplyPrompt(input());
    expect(text(messages[0]?.content)).toContain("Onnit is cheerful and loves Robin.");
    expect(messages.slice(1)).toEqual([
      { role: "assistant", content: "*waves* Hi, Robin!" },
      { role: "user", content: "Hello Onnit." },
    ]);
    const named = buildReplyPrompt(input({ character: { ...input().character, chatName: "Onni" } }));
    expect(text(named[2]?.content)).toBe("Hello Onni.");
  });

  it("a $ in a name stays as text, because the name is not a replacement pattern", () => {
    const messages = buildReplyPrompt(input({ userName: "Ann$'", character: { ...input().character, chatName: "$$Bot" } }));
    expect(messages.slice(1)).toEqual([
      { role: "assistant", content: "*waves* Hi, Ann$'!" },
      { role: "user", content: "Hello $$Bot." },
    ]);
  });

  it("old messages drop out when the history is over 16,000 tokens, and the newest message stays", () => {
    // Each message is about 5,000 tokens, so only the newest messages fit in the budget.
    const history = Array.from({ length: 6 }, (_, n) => ({
      role: n % 2 === 0 ? ("assistant" as const) : ("user" as const),
      content: `${n} ${"x".repeat(20_000)}`,
    }));
    const messages = buildReplyPrompt(input({ history }));
    expect(messages.length).toBe(1 + 3);
    expect(text(messages.at(-1)?.content).startsWith("5 ")).toBe(true);
    expect(text(messages[1]?.content).startsWith("3 ")).toBe(true);
  });

  it("a newest message of 20,000 tokens still goes in", () => {
    const messages = buildReplyPrompt(input({ history: [{ role: "user", content: "y".repeat(80_000) }] }));
    expect(messages.length).toBe(2);
  });
});

describe("buildChoicesPrompt", () => {
  it("adds the choices instruction as the last user message", () => {
    const messages = buildChoicesPrompt(input());
    expect(messages.at(-1)).toEqual({
      role: "user",
      content:
        "Write four short replies that Robin could say next, in the voice of Robin. Each reply has 25 words or less. Answer only with a JSON array of four strings.",
    });
  });
});

describe("parseChoices", () => {
  it("accepts a fenced JSON array of four strings and trims them", () => {
    expect(parseChoices('```json\n[" Yes ", "No", "Maybe", "Run!"]\n```')).toEqual(["Yes", "No", "Maybe", "Run!"]);
  });

  it("gives null for prose, three items, a number item, an empty item, and a 301-character item", () => {
    const bad = [
      "Here are four ideas: yes, no, maybe, run.",
      '["a", "b", "c"]',
      '["a", "b", "c", 4]',
      '["a", "b", "c", "  "]',
      JSON.stringify(["a", "b", "c", "z".repeat(301)]),
    ];
    for (const answer of bad) {
      expect(parseChoices(answer), answer).toBeNull();
    }
  });
});
