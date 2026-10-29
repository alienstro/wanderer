import { describe, expect, it } from "vitest";
import { BIO_PREVIEW_MAX, bioPreview, characterInputSchema, characterListQuerySchema } from "./characters.js";
import { characterTokenCounts, estimateTokens } from "./tokens.js";

const minimal = {
  title: "Mira",
  bio: "A ship mechanic.",
  personality: "Calm and dry.",
  openings: ["The engine coughs."],
};

describe("characterInputSchema", () => {
  it("accepts a minimal character", () => {
    const input = characterInputSchema.parse(minimal);
    expect(input).toMatchObject({
      title: "Mira",
      chatName: "",
      tags: [],
      isAdult: false,
      scenario: "",
      exampleDialogs: "",
      avatarFileId: null,
      isPublic: true,
      definitionVisible: true,
      publish: false,
    });
  });

  it("rejects a 61-character title, 0 openings, 11 openings, and 11 tags", () => {
    const tags = ["adventure", "fantasy", "horror", "military", "mystery", "noir", "post-apoc", "school", "sci-fi", "slice-of-life", "adventure"];
    expect(characterInputSchema.safeParse({ ...minimal, title: "a".repeat(61) }).success).toBe(false);
    expect(characterInputSchema.safeParse({ ...minimal, openings: [] }).success).toBe(false);
    expect(characterInputSchema.safeParse({ ...minimal, openings: Array(11).fill("Hi") }).success).toBe(false);
    expect(characterInputSchema.safeParse({ ...minimal, tags }).success).toBe(false);
  });

  it('rejects the tag "romance"', () => {
    expect(characterInputSchema.safeParse({ ...minimal, tags: ["romance"] }).success).toBe(false);
  });

  it("drops a duplicate tag", () => {
    expect(characterInputSchema.parse({ ...minimal, tags: ["noir", "noir", "horror"] }).tags).toEqual(["noir", "horror"]);
  });
});

describe("characterListQuerySchema", () => {
  it("rejects a 101-character q and defaults sort to most_chats", () => {
    expect(characterListQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
    expect(characterListQuerySchema.parse({}).sort).toBe("most_chats");
  });
});

describe("token estimate", () => {
  it('estimateTokens("abcdefgh") is 2 and estimateTokens("abcdefghi") is 3', () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abcdefghi")).toBe(3);
  });

  it("characterTokenCounts uses the title when the chat name is empty", () => {
    const counts = characterTokenCounts({
      title: "abcd",
      chatName: "",
      bio: "abcd",
      personality: "abcd",
      scenario: "",
      openings: ["abcd", "abcd"],
      exampleDialogs: "",
    });
    expect(counts).toEqual({ permanent: 2, total: 5 });
  });
});

describe("bioPreview", () => {
  it("removes the Markdown marks and joins the lines with one space", () => {
    expect(bioPreview("The captain of a **salvage ship**.\n\n> *Quiet* and [kind](https://example.com).\n# Notes")).toBe(
      "The captain of a salvage ship. Quiet and kind. Notes",
    );
  });

  it(`cuts a long bio at a word, to ${BIO_PREVIEW_MAX} characters or less with the ellipsis`, () => {
    const preview = bioPreview("word ".repeat(100));
    expect(preview.length).toBeLessThanOrEqual(BIO_PREVIEW_MAX);
    expect(preview.endsWith("word…")).toBe(true);
  });
});
