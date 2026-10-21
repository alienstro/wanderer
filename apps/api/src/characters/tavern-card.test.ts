import { beforeAll, describe, expect, it } from "vitest";
import { cardText, pngImage, withTextChunk } from "../../test/support/images.js";
import { readTavernCard } from "./tavern-card.js";

const v2Card = {
  spec: "chara_card_v2",
  data: {
    name: "Mira",
    description: "A ship mechanic.",
    personality: "Calm and dry.",
    scenario: "A cargo ship near Titan.",
    first_mes: "The engine coughs.",
    alternate_greetings: [] as string[],
    mes_example: "<START>\n{{char}}: Hey.",
    creator_notes: "My first card.",
    tags: ["SciFi"],
  },
};

describe("readTavernCard", () => {
  let png: Buffer;

  beforeAll(async () => {
    png = await pngImage(20, 20);
  });

  it("a V2 chara chunk gives the title, personality, scenario, openings, and example dialogs", () => {
    const draft = readTavernCard(withTextChunk(png, "chara", cardText(v2Card)));
    expect(draft).toEqual({
      title: "Mira",
      bio: "My first card.",
      personality: "A ship mechanic.\n\nCalm and dry.",
      scenario: "A cargo ship near Titan.",
      openings: ["The engine coughs."],
      exampleDialogs: "<START>\n{{char}}: Hey.",
      tags: ["sci-fi"],
    });
  });

  it("a ccv3 chunk wins over a chara chunk in the same file", () => {
    const v3 = { spec: "chara_card_v3", data: { ...v2Card.data, name: "Mira V3" } };
    const file = withTextChunk(withTextChunk(png, "ccv3", cardText(v3)), "chara", cardText(v2Card));
    expect(readTavernCard(file)?.title).toBe("Mira V3");
  });

  it("alternate greetings become openings 2 to 10, and an unknown tag is dropped", () => {
    const greetings = Array.from({ length: 12 }, (_, i) => `Greeting ${i + 2}`);
    const card = { ...v2Card, data: { ...v2Card.data, alternate_greetings: greetings, tags: ["noir", "Romance", "Horror"] } };
    const draft = readTavernCard(withTextChunk(png, "chara", cardText(card)));
    expect(draft?.openings).toHaveLength(10);
    expect(draft?.openings?.[0]).toBe("The engine coughs.");
    expect(draft?.openings?.[1]).toBe("Greeting 2");
    expect(draft?.tags).toEqual(["horror", "noir"]);
  });

  it("a text over a field limit is cut to the limit", () => {
    const card = { ...v2Card, data: { ...v2Card.data, name: "x".repeat(100) } };
    expect(readTavernCard(withTextChunk(png, "chara", cardText(card)))?.title).toHaveLength(60);
  });

  it("a PNG with no card, broken base64, or broken JSON gives null", () => {
    expect(readTavernCard(png)).toBeNull();
    expect(readTavernCard(withTextChunk(png, "chara", "!!!not base64!!!"))).toBeNull();
    expect(readTavernCard(withTextChunk(png, "chara", Buffer.from("{broken").toString("base64")))).toBeNull();
    expect(readTavernCard(Buffer.from("not a png at all"))).toBeNull();
  });
});
