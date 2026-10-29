import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./composer";

describe("Composer", () => {
  it("tells the user under the text box that the characters are AI and the chat is fiction", () => {
    render(
      <Composer value="" onChange={vi.fn()} disabled={false} streaming={false} onSend={vi.fn()} onStop={vi.fn()} />,
    );

    expect(
      screen.getByText("Characters are AI, not real people. Treat everything they say as fiction."),
    ).toBeInTheDocument();
  });
});
