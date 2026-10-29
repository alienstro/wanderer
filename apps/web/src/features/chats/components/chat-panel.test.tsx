import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterDetail, SceneView } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";

const character: CharacterDetail = {
  id: "c1",
  title: "Captain Ilse Varga",
  chatName: "Ilse",
  avatarUrl: "/files/f1",
  tags: [{ slug: "sci-fi", label: "SciFi" }],
  chatCount: 412,
  likeCount: 3,
  creatorHandle: "tian",
  bioPreview: "The captain of a salvage ship.",
  bio: "The captain of a **salvage ship**.",
  commentCount: 9,
  status: "published",
  isPublic: true,
  definitionVisible: true,
  openings: ["Hello."],
  definition: null,
  isOwner: false,
  likedByMe: false,
  createdAt: "2026-10-20T10:00:00.000Z",
};

const scene: SceneView = { id: "s1", url: "/files/scene1", afterPosition: 1, createdAt: "2026-10-21T10:00:00.000Z" };

/** /me gives the user, and /characters/c1 gives the character. */
function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/me")) {
        return Response.json({ id: "u1", name: "Robin", handle: "robin", replyChoicesOn: true, activeProxy: null });
      }
      if (url.endsWith("/characters/c1")) {
        return Response.json(character);
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    }),
  );
}

function renderPanel(props: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatPanel
        chatId="chat1"
        characterId="c1"
        personaName="Captain Rook"
        memory={{ text: "The beacon points to the Halcyon.", throughPosition: 4 }}
        scenes={[scene]}
        onMemorySaved={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatPanel", () => {
  it("shows the character name as a link to the character page, the chat, like and comment counts, the tags, and the bio in the Profile tab", async () => {
    stubApi();
    renderPanel();
    expect(await screen.findByRole("link", { name: /Captain Ilse Varga/ })).toHaveAttribute("href", "/characters/c1");
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("SciFi")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("salvage ship").tagName).toBe("STRONG");
    expect(screen.getByText(/You play as/)).toHaveTextContent("You play as Captain Rook");
  });

  it("the Memory tab shows the saved memory and an Edit memory button", async () => {
    stubApi();
    renderPanel();
    await userEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(screen.getByRole("tabpanel", { name: "Memory" })).toHaveTextContent("The beacon points to the Halcyon.");
    expect(screen.getByRole("button", { name: "Edit memory" })).toBeInTheDocument();
  });

  it("the Scenes tab shows each scene image, and a hint when the chat has no scenes", async () => {
    stubApi();
    const { unmount } = renderPanel();
    await userEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    expect(screen.getByRole("img", { name: "Scene image 1" })).toHaveAttribute("src", "/files/scene1");
    unmount();

    renderPanel({ scenes: [] });
    await userEvent.click(screen.getByRole("tab", { name: "Scenes" }));
    expect(screen.getByRole("tabpanel", { name: "Scenes" })).toHaveTextContent("No scenes yet.");
  });
});
