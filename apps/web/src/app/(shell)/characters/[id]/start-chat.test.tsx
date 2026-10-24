import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartChat } from "./start-chat";
import { YourChats } from "./your-chats";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/characters/c1" }));

const me = { id: "u1", name: "Tian", handle: "tian", activeProxy: null, replyChoicesOn: true };
const chatList = {
  items: [
    {
      id: "chat1",
      title: "Mira",
      character: { id: "c1", title: "Mira", chatName: "", avatarUrl: null },
      lastMessage: "See you at the dock.",
      lastMessageAt: "2026-10-21T10:00:00.000Z",
      messageCount: 12,
    },
  ],
};

function stubApi(user: typeof me | null = me, list: typeof chatList = chatList) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) {
      return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (url.endsWith("/chats") && init?.method === "POST") {
      return Response.json({ chat: { id: "new-chat" }, messages: [], canSend: true }, { status: 201 });
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return url.includes("/chats?characterId=c1") ? Response.json(list) : Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function postBody(fetchMock: ReturnType<typeof stubApi>) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

/** A list of `count` chats, newest first, with the last message "Chat <n>". */
function manyChats(count: number): typeof chatList {
  const [first] = chatList.items;
  if (!first) {
    throw new Error("chatList needs one item");
  }
  return { items: Array.from({ length: count }, (_, n) => ({ ...first, id: `chat${n + 1}`, lastMessage: `Chat ${n + 1}` })) };
}

describe("start a chat", () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a user with no chat sees only Start a new chat, and a click sends POST /chats with only characterId", async () => {
    const fetchMock = stubApi(me, { items: [] });
    withClient(<StartChat characterId="c1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Start a new chat" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/chats/new-chat"));
    expect(postBody(fetchMock)).toEqual({ characterId: "c1" });
    expect(screen.queryByRole("link", { name: "Continue latest chat" })).not.toBeInTheDocument();
  });

  it("a user with a chat sees Continue latest chat that opens the newest chat, and Start a new chat", async () => {
    stubApi();
    withClient(<StartChat characterId="c1" />);
    expect(await screen.findByRole("link", { name: "Continue latest chat" })).toHaveAttribute("href", "/chats/chat1");
    expect(screen.getByRole("button", { name: "Start a new chat" })).toBeInTheDocument();
  });

  it("the page shows no opening to pick", async () => {
    stubApi();
    withClient(<StartChat characterId="c1" />);
    await screen.findByRole("button", { name: "Start a new chat" });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it('a visitor sees "Log in to chat"', async () => {
    stubApi(null);
    withClient(<StartChat characterId="c1" />);
    expect(await screen.findByRole("link", { name: "Log in to chat" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Start a new chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue latest chat" })).not.toBeInTheDocument();
  });

  it("Your chats lists the chats, and Delete asks for a confirm before the DELETE", async () => {
    const fetchMock = stubApi();
    withClient(<YourChats characterId="c1" />);
    expect(await screen.findByText("See you at the dock.")).toBeInTheDocument();
    expect(screen.getByText(/· 12 messages$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/chats/chat1");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/chats\/chat1$/), expect.objectContaining({ method: "DELETE" })),
    );
  });

  it("Your chats with 10 chats shows the first three and a Show all chats button", async () => {
    stubApi(me, manyChats(10));
    withClient(<YourChats characterId="c1" />);
    expect(await screen.findByText("Chat 1")).toBeInTheDocument();
    expect(screen.getByText("Chat 3")).toBeInTheDocument();
    expect(screen.queryByText("Chat 4")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Show all 10 chats" })).toBeInTheDocument();
  });

  it("Show all chats opens a dialog with all 10 chats, and Close or Escape closes it", async () => {
    stubApi(me, manyChats(10));
    withClient(<YourChats characterId="c1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Show all 10 chats" }));
    const dialog = screen.getByRole("dialog", { name: "Your chats" });
    expect(within(dialog).getAllByRole("link", { name: "Open" })).toHaveLength(10);
    expect(within(dialog).getByText("Chat 10")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show all 10 chats" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Your chats with 3 chats shows all three and no Show all button", async () => {
    stubApi(me, manyChats(3));
    withClient(<YourChats characterId="c1" />);
    expect(await screen.findByText("Chat 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("Your chats shows the formatting of the last message, such as italic", async () => {
    const [first] = chatList.items;
    stubApi(me, { items: first ? [{ ...first, lastMessage: "*The lights flicker.* **Run.**" }] : [] });
    withClient(<YourChats characterId="c1" />);
    expect((await screen.findByText("The lights flicker.")).tagName).toBe("EM");
    expect(screen.getByText("Run.").tagName).toBe("STRONG");
  });
});
