import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatDetail, ChatStreamEvent, MessageView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "./chat-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chats/chat1" }));

type StreamOptions = { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void };
const streamMock = vi.fn<(path: string, body: unknown, options: StreamOptions) => Promise<void>>();
vi.mock("@/lib/chat-stream", () => ({
  streamChat: (path: string, body: unknown, options: StreamOptions) => streamMock(path, body, options),
}));

function message(id: string, role: MessageView["role"], content: string, position: number): MessageView {
  return { id, role, content, position, editedAt: null, createdAt: "2026-10-21T00:00:00.000Z" };
}

const detail: ChatDetail = {
  chat: {
    id: "chat1",
    title: "Onnit",
    character: { id: "c1", title: "Onnit", chatName: "", avatarUrl: null },
    lastMessage: "Hi!",
    lastMessageAt: "2026-10-21T00:00:00.000Z",
  },
  messages: [message("m0", "assistant", "Hi!", 0)],
  canSend: true,
};

const SETS = [
  ["Hello!", "Who are you?", "*waves back*", "Bye."],
  ["Tell me more.", "Why?", "Sure.", "No way."],
];

function stubApi(options: { replyChoicesOn?: boolean; choicesStatus?: number } = {}) {
  let me = {
    id: "u1",
    name: "Robin",
    pictureUrl: null,
    replyChoicesOn: options.replyChoicesOn ?? true,
    activeProxy: { id: "p1", name: "OpenRouter", model: "m" },
  };
  let round = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me") && init?.method === "PATCH") {
      me = { ...me, ...(JSON.parse(String(init.body)) as { replyChoicesOn: boolean }) };
      return Response.json(me);
    }
    if (url.endsWith("/me")) {
      return Response.json(me);
    }
    if (url.endsWith("/choices")) {
      if (options.choicesStatus) {
        return Response.json({ error: "choices_failed" }, { status: options.choicesStatus });
      }
      return Response.json({ choices: SETS[round++ % SETS.length] });
    }
    return url.endsWith("/chats/chat1") ? Response.json(detail) : Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Each send streams one short reply. */
function replyWith(content: string) {
  let n = 10;
  streamMock.mockImplementation(async (_path, body, { onEvent }) => {
    const text = (body as { content: string }).content;
    onEvent({ type: "start", userMessage: message(`u${n}`, "user", text, n) });
    onEvent({ type: "done", message: message(`a${n}`, "assistant", content, n + 1) });
    n += 2;
  });
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

async function send(text: string) {
  await userEvent.type(await screen.findByRole("textbox", { name: "Message" }), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

const choicesCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/choices")).length;

describe("reply choices", () => {
  beforeEach(() => {
    streamMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("after done, four choices show, and a click on one sends its text", async () => {
    stubApi();
    replyWith("Nice to meet you.");
    withClient(<ChatView chatId="chat1" />);
    await send("Hi");
    expect(await screen.findByRole("button", { name: "Who are you?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Hello!|Who are you\?|\*waves back\*|Bye\.)$/ })).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Who are you?" }));
    await vi.waitFor(() => expect(streamMock).toHaveBeenLastCalledWith("/chats/chat1/messages", { content: "Who are you?" }, expect.anything()));
  });

  it('"New choices" asks again and shows the new set', async () => {
    stubApi();
    replyWith("Nice to meet you.");
    withClient(<ChatView chatId="chat1" />);
    await send("Hi");
    await screen.findByRole("button", { name: "Bye." });
    await userEvent.click(screen.getByRole("button", { name: "New choices" }));
    expect(await screen.findByRole("button", { name: "Tell me more." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bye." })).not.toBeInTheDocument();
  });

  it("a 502 answer shows no choices and no error text", async () => {
    const fetchMock = stubApi({ choicesStatus: 502 });
    replyWith("Nice to meet you.");
    withClient(<ChatView chatId="chat1" />);
    await send("Hi");
    await vi.waitFor(() => expect(choicesCalls(fetchMock)).toBe(1));
    expect(screen.queryByRole("button", { name: "New choices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the switch off sends PATCH /me { replyChoicesOn: false } and hides the choices", async () => {
    const fetchMock = stubApi();
    replyWith("Nice to meet you.");
    withClient(<ChatView chatId="chat1" />);
    await send("Hi");
    await screen.findByRole("button", { name: "Bye." });
    const toggle = screen.getByRole("switch", { name: "Reply choices" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await userEvent.click(toggle);
    expect(screen.queryByRole("button", { name: "Bye." })).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/me$/),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ replyChoicesOn: false }) }),
      ),
    );
  });

  it("with replyChoicesOn false, done asks for no choices", async () => {
    const fetchMock = stubApi({ replyChoicesOn: false });
    replyWith("Nice to meet you.");
    withClient(<ChatView chatId="chat1" />);
    await send("Hi");
    await screen.findByText("Nice to meet you.");
    expect(choicesCalls(fetchMock)).toBe(0);
    expect(screen.getByRole("switch", { name: "Reply choices" })).toHaveAttribute("aria-checked", "false");
  });
});
