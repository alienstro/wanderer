import { beforeAll, describe, expect, it } from "vitest";
import { cardText, pngImage, withCompressedItxtChunk, withTextChunk } from "../../test/support/images.js";
import { mapTavernCard, readTavernCard } from "./tavern-card.js";

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

  it("a compressed iTXt ccv3 chunk is read, and a compressed chunk with another keyword is skipped", () => {
    const v3 = { spec: "chara_card_v3", data: { ...v2Card.data, name: "Mira iTXt" } };
    const file = withCompressedItxtChunk(withCompressedItxtChunk(png, "ccv3", cardText(v3)), "comment", "x".repeat(10_000));
    expect(readTavernCard(file)?.title).toBe("Mira iTXt");
  });

  it("only the first chara chunk is read, so that a file cannot make the API inflate many chunks", () => {
    const first = { ...v2Card, data: { ...v2Card.data, name: "First" } };
    const second = { ...v2Card, data: { ...v2Card.data, name: "Second" } };
    // Each helper call puts its chunk directly after IHDR, so the last call gives the first chunk.
    const file = withCompressedItxtChunk(withCompressedItxtChunk(png, "chara", cardText(second)), "chara", cardText(first));
    expect(readTavernCard(file)?.title).toBe("First");
  });

  it("a chara chunk that fails to inflate stops the read of all later chara chunks", () => {
    // 3 MB of text inflates past the 2 MB cap, so the first chunk fails.
    const file = withCompressedItxtChunk(withCompressedItxtChunk(png, "chara", cardText(v2Card)), "chara", "x".repeat(3 * 1024 * 1024));
    expect(readTavernCard(file)).toBeNull();
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

describe("mapTavernCard", () => {
  const draft = {
    title: "Mira",
    bio: "My first card.",
    personality: "A ship mechanic.\n\nCalm and dry.",
    scenario: "A cargo ship near Titan.",
    openings: ["The engine coughs."],
    exampleDialogs: "<START>\n{{char}}: Hey.",
    tags: ["sci-fi"],
  };

  it("a V2 card JSON gives the same draft as the PNG import", () => {
    expect(mapTavernCard(v2Card)).toEqual(draft);
  });

  it("a V3 card JSON reads the fields from data", () => {
    expect(mapTavernCard({ spec: "chara_card_v3", spec_version: "3.0", data: v2Card.data })).toEqual(draft);
  });

  it("a V1 card JSON reads the fields from the top level", () => {
    expect(mapTavernCard(v2Card.data)).toEqual(draft);
  });

  it("a JSON with no name, or with a name and no other card field, gives null", () => {
    expect(mapTavernCard({ spec: "chara_card_v2", data: { ...v2Card.data, name: "" } })).toBeNull();
    expect(mapTavernCard({ name: "Mira" })).toBeNull();
    expect(mapTavernCard({ hello: "world" })).toBeNull();
  });

  it("a JSON that is not an object gives null", () => {
    expect(mapTavernCard(null)).toBeNull();
    expect(mapTavernCard("Mira")).toBeNull();
    expect(mapTavernCard(["Mira"])).toBeNull();
    expect(mapTavernCard({ data: "Mira" })).toBeNull();
  });
});
