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

  it("is one row: the leading control on the left of the text box, and the tools and Send on the right", () => {
    render(
      <Composer
        characterName="Ilse"
        value=""
        onChange={vi.fn()}
        disabled={false}
        streaming={false}
        onSend={vi.fn()}
        onStop={vi.fn()}
        leading={<button type="button">Lead</button>}
        toolbar={<button type="button">Tool</button>}
      />,
    );
    const box = screen.getByRole("textbox", { name: "Message" });
    const lead = screen.getByRole("button", { name: "Lead" });
    const tool = screen.getByRole("button", { name: "Tool" });
    const send = screen.getByRole("button", { name: "Send" });
    expect(lead.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tool.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box).toHaveAttribute("rows", "1");
  });
});
