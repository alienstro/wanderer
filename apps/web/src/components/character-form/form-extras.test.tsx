import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterForm } from "./character-form";

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pngFile(bytes: number, name = "a.png") {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

describe("form extras", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a 6 MB file shows the size message and sends no request", async () => {
    const fetchMock = stubFetch(() => Response.json({}));
    render(<CharacterForm onSaved={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Choose an avatar image"), pngFile(6 * 1024 * 1024));

    expect(screen.getByText("Use a PNG, JPEG, or WebP image of 5 MB or less.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an avatar upload shows the new image and saves its ID", async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith("/files") ? Response.json({ id: "f1", url: "/files/f1" }, { status: 201 }) : Response.json({ id: "c1" }, { status: 201 }),
    );
    render(<CharacterForm onSaved={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Choose an avatar image"), pngFile(100));

    expect(await screen.findByRole("img", { name: "Your avatar" })).toHaveAttribute("src", "/files/f1");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('B around the selected word "brave" makes "**brave**", and U makes "<u>brave</u>"', async () => {
    render(<CharacterForm onSaved={vi.fn()} />);
    const bio = screen.getByLabelText<HTMLTextAreaElement>(/^Bio/);
    await userEvent.type(bio, "a brave hero");

    bio.setSelectionRange(2, 7);
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(bio).toHaveValue("a **brave** hero");

    await userEvent.clear(bio);
    await userEvent.type(bio, "a brave hero");
    bio.setSelectionRange(2, 7);
    await userEvent.click(screen.getByRole("button", { name: "Underline" }));
    expect(bio).toHaveValue("a <u>brave</u> hero");
  });

  it("a Tavern import fills the title and the openings and keeps a typed scenario that the card does not have", async () => {
    stubFetch((url) =>
      url.endsWith("/characters/import-png")
        ? Response.json({ draft: { title: "Mira", personality: "Calm.", openings: ["Hi.", "Hello."] }, avatarFileId: "f2" })
        : Response.json({}),
    );
    render(<CharacterForm onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Scenario/), "A cargo ship.");

    await userEvent.upload(screen.getByLabelText("Import a Tavern PNG"), pngFile(100, "card.png"));

    expect(await screen.findByDisplayValue("Mira")).toBeInTheDocument();
    expect(screen.getByLabelText("Message 1 text")).toHaveValue("Hi.");
    expect(screen.getByRole("button", { name: "Message 2" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Scenario/)).toHaveValue("A cargo ship.");
    expect(screen.getByRole("img", { name: "Your avatar" })).toHaveAttribute("src", "/files/f2");
  });

  it('a 400 import answer shows "This PNG has no character card."', async () => {
    stubFetch(() => Response.json({ error: "no_character_card" }, { status: 400 }));
    render(<CharacterForm onSaved={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Import a Tavern PNG"), pngFile(100, "plain.png"));

    expect(await screen.findByText("This PNG has no character card.")).toBeInTheDocument();
  });

  it("a 400 invalid_image import answer shows the image message", async () => {
    stubFetch(() => Response.json({ error: "invalid_image" }, { status: 400 }));
    render(<CharacterForm onSaved={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Import a Tavern PNG"), pngFile(100, "broken.png"));

    expect(await screen.findByText("Use a PNG, JPEG, or WebP image of 5 MB or less.")).toBeInTheDocument();
  });

  it("the preview card shows the new title while the user types", async () => {
    render(<CharacterForm onSaved={vi.fn()} creatorHandle="tian" />);
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(preview).toHaveTextContent("Untitled");

    await userEvent.type(screen.getByLabelText(/^Title/), "Mira");

    expect(preview).toHaveTextContent("Mira");
    expect(preview).toHaveTextContent("@tian");
  });
});
