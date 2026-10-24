import { render, screen } from "@testing-library/react";
import type { CharacterCard as Card } from "@wanderer/shared";
import { describe, expect, it } from "vitest";
import { CharacterCard } from "./character-card";

const card: Card = {
  id: "c1",
  title: "Mira Vale",
  chatName: "",
  avatarUrl: null,
  isAdult: false,
  tags: [
    { slug: "sci-fi", label: "SciFi" },
    { slug: "mystery", label: "Mystery" },
    { slug: "noir", label: "Noir" },
    { slug: "horror", label: "Horror" },
  ],
  chatCount: 1234,
  likeCount: 0,
  creatorHandle: "tian",
};

describe("CharacterCard", () => {
  it("a card with no avatar shows the first letter of the title", () => {
    render(<CharacterCard card={card} />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/characters/c1");
  });

  it("a card shows the chat count, up to 3 tags, @creator, and an 18+ badge only for an 18+ character", () => {
    const { rerender } = render(<CharacterCard card={card} />);
    expect(screen.getByText("1.2K chats")).toBeInTheDocument();
    expect(screen.getByText("SciFi")).toBeInTheDocument();
    expect(screen.getByText("Noir")).toBeInTheDocument();
    expect(screen.queryByText("Horror")).not.toBeInTheDocument();
    expect(screen.getByText("@tian")).toBeInTheDocument();
    expect(screen.queryByText("18+")).not.toBeInTheDocument();

    rerender(<CharacterCard card={{ ...card, isAdult: true, avatarUrl: "/files/f1" }} />);
    expect(screen.getByText("18+")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mira Vale" })).toHaveAttribute("src", "/files/f1");
  });
});
