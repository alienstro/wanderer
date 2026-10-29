import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TAGS } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterForm } from "./character-form";

const saved = { id: "c1", title: "Mira" };

function stubFetch(status = 201, body: unknown = saved) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^Title/), "Mira");
  await userEvent.type(screen.getByLabelText(/^Bio/), "A mechanic.");
  await userEvent.type(screen.getByLabelText(/^Personality/), "Calm.");
  await userEvent.type(screen.getByLabelText("Message 1 text"), "The engine coughs.");
}

describe("CharacterForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the fields come in the spec order", () => {
    const { container } = render(<CharacterForm onSaved={vi.fn()} />);
    const fields = [...container.querySelectorAll("[data-field]")].map((node) => node.getAttribute("data-field"));
    expect(fields).toEqual([
      "avatar",
      "title",
      "chatName",
      "bio",
      "tags",
      "personality",
      "scenario",
      "openings",
      "exampleDialogs",
      "isPublic",
      "definitionVisible",
    ]);
    expect(screen.getByText("Use {{char}} and {{user}}.")).toBeInTheDocument();
  });

  it("the footer counts update as the user types, and Permanent uses the title when the chat name is empty", async () => {
    render(<CharacterForm onSaved={vi.fn()} />);
    expect(screen.getByText("Total: 0 tokens. Permanent: 0 tokens.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Title/), "abcdefgh");
    await userEvent.type(screen.getByLabelText(/^Personality/), "abcdefgh");
    expect(screen.getByText("Total: 4 tokens. Permanent: 4 tokens.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Chat name/), "ab");
    await userEvent.type(screen.getByLabelText(/^Bio/), "abcd");
    expect(screen.getByText("Total: 4 tokens. Permanent: 3 tokens.")).toBeInTheDocument();
  });

  it("Add stops at 10 openings, Delete stops at 1, and Move right swaps two tabs", async () => {
    render(<CharacterForm onSaved={vi.fn()} />);
    const tabs = screen.getByRole("group", { name: "Initial messages" });
    expect(screen.getByRole("button", { name: "Delete this message" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Message 1 text"), "first");
    await userEvent.click(screen.getByRole("button", { name: "Add a message" }));
    await userEvent.type(screen.getByLabelText("Message 2 text"), "second");
    await userEvent.click(within(tabs).getByRole("button", { name: "Message 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Move right" }));
    expect(screen.getByLabelText("Message 2 text")).toHaveValue("first");
    await userEvent.click(within(tabs).getByRole("button", { name: "Message 1" }));
    expect(screen.getByLabelText("Message 1 text")).toHaveValue("second");

    for (let i = 0; i < 8; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Add a message" }));
    }
    expect(within(tabs).getAllByRole("button", { name: /^Message \d+$/ })).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Add a message" })).toBeDisabled();

    for (let i = 0; i < 9; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Delete this message" }));
    }
    expect(within(tabs).getAllByRole("button", { name: /^Message \d+$/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Delete this message" })).toBeDisabled();
  });

  it("a tag chip toggles, and all 10 tags can be picked", async () => {
    render(<CharacterForm onSaved={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Tags" });
    const noir = within(group).getByRole("button", { name: "Noir" });
    await userEvent.click(noir);
    expect(noir).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(noir);
    expect(noir).toHaveAttribute("aria-pressed", "false");

    for (const tag of TAGS) {
      await userEvent.click(within(group).getByRole("button", { name: tag.label }));
    }
    expect(within(group).getAllByRole("button", { pressed: true })).toHaveLength(10);
  });

  it("Save draft sends publish false, and Publish sends publish true", async () => {
    const fetchMock = stubFetch();
    const onSaved = vi.fn();
    render(<CharacterForm onSaved={onSaved} />);
    await fillRequired();

    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(sentBody(fetchMock, 0)).toMatchObject({ title: "Mira", openings: ["The engine coughs."], publish: false });

    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(sentBody(fetchMock, 1)).toMatchObject({ publish: true });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/characters$/);
  });

  it("the edit form of a published character shows Save and Move to drafts, and Save keeps it published", async () => {
    const fetchMock = stubFetch(200);
    const published = {
      id: "c1",
      title: "Mira",
      chatName: "",
      avatarUrl: null,
      tags: [],
      chatCount: 0,
      likeCount: 0,
      creatorHandle: "tian",
      bio: "Bio",
      status: "published" as const,
      isPublic: true,
      definitionVisible: true,
      openings: ["Hi."],
      definition: { personality: "Calm.", scenario: "", exampleDialogs: "" },
      isOwner: true,
      likedByMe: false,
      createdAt: "2026-10-21T00:00:00.000Z",
    };
    render(<CharacterForm initial={published} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to drafts" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody(fetchMock)).toMatchObject({ publish: true });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
  });

  it('a 409 title_taken shows "You already have a character with this title."', async () => {
    stubFetch(409, { error: "title_taken" });
    const onSaved = vi.fn();
    render(<CharacterForm onSaved={onSaved} />);
    await fillRequired();

    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("You already have a character with this title.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a missing title shows an error under the title and sends nothing", async () => {
    const fetchMock = stubFetch();
    render(<CharacterForm onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByLabelText(/^Title/)).toHaveAccessibleDescription(/Write a title\./);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
