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

  it("a card shows the chat and like counts, up to 3 tags, @creator, and an 18+ badge only for an 18+ character", () => {
    const { rerender } = render(<CharacterCard card={card} />);
    expect(screen.getByText("1.2K")).toHaveTextContent("1.2K chats");
    expect(screen.getByText("0")).toHaveTextContent("0 likes");
    expect(screen.getByText("SciFi")).toBeInTheDocument();
    expect(screen.getByText("Noir")).toBeInTheDocument();
    expect(screen.queryByText("Horror")).not.toBeInTheDocument();
    expect(screen.getByText("@tian")).toBeInTheDocument();
    expect(screen.queryByText("18+")).not.toBeInTheDocument();

    rerender(<CharacterCard card={{ ...card, isAdult: true, avatarUrl: "/files/f1" }} />);
    expect(screen.getByText("18+")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mira Vale" })).toHaveAttribute("src", "/files/f1");
  });

  it("a status badge shows next to the title, not on the image, so it does not push the image badges to a second line", () => {
    const { container } = render(<CharacterCard card={{ ...card, isAdult: true }} statusBadge="Private" />);
    const status = screen.getByText("Private");
    expect(status.parentElement).toBe(screen.getByText("Mira Vale").parentElement);
    expect(container.querySelector(".shot")).not.toContainElement(status);
    expect(container.querySelector(".shot")).toContainElement(screen.getByText("18+"));
  });
});
