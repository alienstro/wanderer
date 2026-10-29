import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterDetail } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterPage } from "./character-page";
import { CharacterView } from "./character-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/characters/c1" }));

const detail: CharacterDetail = {
  id: "c1",
  title: "Mira Vale",
  chatName: "Mira",
  avatarUrl: null,
  isAdult: false,
  tags: [{ slug: "sci-fi", label: "SciFi" }],
  chatCount: 3,
  likeCount: 0,
  creatorHandle: "tian",
  bioPreview: "A ship mechanic.",
  bio: "A **ship** mechanic.",
  commentCount: 7,
  status: "published",
  isPublic: true,
  definitionVisible: true,
  openings: ["The engine coughs.", "The lights go out."],
  definition: { personality: "Calm and dry.", scenario: "A cargo ship.", exampleDialogs: "" },
  isOwner: false,
  likedByMe: false,
  createdAt: "2026-10-21T00:00:00.000Z",
};

const me = { id: "u1", name: "Tian", email: "t@example.com", pictureUrl: null, handle: "tian", role: "user", suggestedHandle: null };

type Route = (url: string, init?: RequestInit) => Response | undefined;

function stubFetch(route: Route) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => route(url, init) ?? Response.json({ error: "not_found" }, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("character page", () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the view shows the title, "Chat with" the chat name, @creator, the bio, the tags, and no openings', () => {
    stubFetch(() => undefined);
    withClient(<CharacterView detail={detail} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mira Vale" })).toBeInTheDocument();
    expect(screen.getByText(/Chat with/)).toHaveTextContent("Chat with Mira");
    expect(screen.getByText("@tian")).toBeInTheDocument();
    expect(screen.getByText("ship").tagName).toBe("STRONG");
    expect(screen.getByText("SciFi")).toBeInTheDocument();
    expect(screen.queryByText("The engine coughs.")).not.toBeInTheDocument();
    expect(screen.queryByText("The lights go out.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How the story starts" })).not.toBeInTheDocument();
    expect(screen.getByText(/Calm and dry\./)).toBeInTheDocument();
  });

  it("the tabs show one section at a time: Comments first for a visitor, then Definition after a click", async () => {
    stubFetch(() => undefined);
    withClient(<CharacterView detail={detail} />);
    expect(screen.queryByRole("tab", { name: /Your chats/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Comments" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tabpanel", { name: "Definition" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Definition" }));

    expect(screen.getByRole("tab", { name: "Definition" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Definition" })).toHaveTextContent(/Calm and dry\./);
    expect(screen.queryByRole("tabpanel", { name: "Comments" })).not.toBeInTheDocument();
  });

  it("the counts show the chats, the likes and the comments of the character", () => {
    stubFetch(() => undefined);
    withClient(<CharacterView detail={detail} />);
    expect(screen.getByText("Comments", { selector: "span.text-subtle" }).previousSibling).toHaveTextContent("7");
  });

  it('definition null shows "The creator keeps the definition of this character hidden."', () => {
    stubFetch(() => undefined);
    withClient(<CharacterView detail={{ ...detail, definitionVisible: false, definition: null }} />);
    expect(screen.getByText("The creator keeps the definition of this character hidden.")).toBeInTheDocument();
  });

  it("a logged-in user who is not the creator sees Report, and the owner and a visitor do not", async () => {
    stubFetch((url) => {
      if (url.endsWith("/me")) return Response.json(me);
      if (url.endsWith("/characters/c1")) return Response.json(detail);
      return undefined;
    });
    const { unmount } = withClient(<CharacterPage id="c1" initial={detail} initialError={null} />);
    expect(await screen.findByRole("button", { name: "Report" })).toBeInTheDocument();
    unmount();

    stubFetch((url) => {
      if (url.endsWith("/me")) return Response.json(me);
      if (url.endsWith("/characters/c1")) return Response.json({ ...detail, isOwner: true });
      return undefined;
    });
    const owner = withClient(<CharacterPage id="c1" initial={detail} initialError={null} />);
    expect(await screen.findByRole("heading", { name: "Character settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
    owner.unmount();

    stubFetch((url) => (url.endsWith("/me") ? Response.json({ error: "unauthorized" }, { status: 401 }) : undefined));
    withClient(<CharacterPage id="c1" initial={detail} initialError={null} />);
    expect(await screen.findByRole("heading", { name: "Mira Vale" })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument());
  });

  it("the owner panel shows only for the owner, and the Public switch sends PATCH { isPublic: false }", async () => {
    const owned = { ...detail, isOwner: true };
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/me")) return Response.json(me);
      if (url.endsWith("/characters/c1") && init?.method === "PATCH") return Response.json({ ...owned, isPublic: false });
      if (url.endsWith("/characters/c1")) return Response.json(owned);
      return undefined;
    });

    withClient(<CharacterPage id="c1" initial={detail} initialError={null} />);
    expect(screen.queryByRole("heading", { name: "Character settings" })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("radio", { name: /Private/ }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/characters\/c1$/),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isPublic: false }) }),
      ),
    );
    expect(await screen.findByRole("radio", { name: /Private/ })).toBeChecked();
  });

  it("Delete asks first, Cancel keeps the character, and the second Delete sends DELETE and goes to /my-characters", async () => {
    const owned = { ...detail, isOwner: true };
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/me")) return Response.json(me);
      if (url.endsWith("/characters/c1") && init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/characters/c1")) return Response.json(owned);
      return undefined;
    });
    withClient(<CharacterPage id="c1" initial={detail} initialError={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete Mira Vale? This cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Delete Mira Vale? This cannot be undone.")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "DELETE" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete character" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/my-characters"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/characters\/c1$/), expect.objectContaining({ method: "DELETE" }));
  });

  it("the 18+ warning button calls POST /me/adult-confirm and then shows the character", async () => {
    let confirmed = false;
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith("/me/adult-confirm") && init?.method === "POST") {
        confirmed = true;
        return Response.json({ ...me, showAdult: true }, { status: 201 });
      }
      if (url.endsWith("/me")) return Response.json({ ...me, showAdult: confirmed });
      if (url.endsWith("/characters/c1")) {
        return confirmed ? Response.json({ ...detail, isAdult: true }) : Response.json({ error: "adult_content" }, { status: 403 });
      }
      return undefined;
    });
    withClient(<CharacterPage id="c1" initial={null} initialError="adult_content" />);

    expect(await screen.findByText("This character is 18+.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "I am 18 or older. Show 18+ content." }));

    expect(await screen.findByRole("heading", { level: 1, name: "Mira Vale" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/me\/adult-confirm$/), expect.objectContaining({ method: "POST" }));
  });

  it("a visitor on an 18+ character sees Log in to continue", async () => {
    stubFetch((url) => (url.endsWith("/me") ? Response.json({ error: "unauthorized" }, { status: 401 }) : undefined));
    withClient(<CharacterPage id="c1" initial={null} initialError="adult_content" />);
    expect(await screen.findByRole("link", { name: "Log in to continue." })).toHaveAttribute("href", "/login");
  });
});
