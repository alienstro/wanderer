import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";

describe("Composer", () => {
  it("tells the user under the text box that the character is AI and the chat is fiction", () => {
    render(
      <Composer
        characterName="Ilse"
        value=""
        onChange={vi.fn()}
        disabled={false}
        streaming={false}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Ilse is an AI character, not a real person. Treat everything they say as fiction."),
    ).toBeInTheDocument();
  });
});
