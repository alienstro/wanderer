import { describe, expect, it } from "vitest";
import { type CharacterDetailRow, toCharacterCard, toCharacterDetail } from "./character-mapper.js";

const row: CharacterDetailRow = {
  id: "c1",
  creatorId: "u1",
  title: "Captain Ilse Varga",
  chatName: "Ilse",
  bio: "The captain of a **salvage ship**.\n\nHer crew is small.",
  personality: "Calm.",
  scenario: "",
  exampleDialogs: "",
  isAdult: false,
  isPublic: true,
  definitionVisible: true,
  status: "published",
  avatarFileId: null,
  chatCount: 412,
  likeCount: 3,
  commentCount: 7,
  createdAt: new Date("2026-10-20T10:00:00.000Z"),
  updatedAt: new Date("2026-10-20T10:00:00.000Z"),
  creator: { handle: "tian" },
  tags: [{ tagSlug: "sci-fi" }],
  openings: [],
};

describe("character mapper", () => {
  it("a card has the plain-text bio preview, and not the full bio", () => {
    const card = toCharacterCard(row);
    expect(card.bioPreview).toBe("The captain of a salvage ship. Her crew is small.");
    expect(card).not.toHaveProperty("bio");
  });

  it("a detail has the comment count of the character", () => {
    expect(toCharacterDetail(row, null, false).commentCount).toBe(7);
  });
});
