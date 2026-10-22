import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatDetail, ChatStreamEvent, MessageView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/toaster";
import { ChatView } from "./chat-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/chats/chat1" }));

type StreamOptions = { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void };
const streamMock = vi.fn<(path: string, body: unknown, options: StreamOptions) => Promise<void>>();
vi.mock("@/lib/chat-stream", () => ({
  streamChat: (path: string, body: unknown, options: StreamOptions) => streamMock(path, body, options),
}));

const me = {
  id: "u1",
  name: "Robin",
  pictureUrl: null,
  handle: "robin",
  replyChoicesOn: false,
  activeProxy: { id: "p1", name: "OpenRouter", model: "m" },
};

function message(id: string, role: MessageView["role"], content: string, position: number): MessageView {
  return { id, role, content, position, editedAt: null, createdAt: "2026-10-21T00:00:00.000Z" };
}

const detail: ChatDetail = {
  chat: {
    id: "chat1",
    title: "Onnit",
    character: { id: "c1", title: "Onnit", chatName: "", avatarUrl: null },
    lastMessage: "Hello",
    lastMessageAt: "2026-10-21T00:00:00.000Z",
  },
  messages: [message("m0", "assistant", "*waves* Hi!", 0), message("m1", "user", "Hello", 1)],
  canSend: true,
};

function stubApi(chat: ChatDetail = detail) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) {
      return Response.json(me);
    }
    if (url.includes("/messages/") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { content: string };
      return Response.json({ ...message("m1", "user", body.content, 1), editedAt: "2026-10-21T01:00:00.000Z" });
    }
    return url.endsWith("/chats/chat1") ? Response.json(chat) : Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

async function typeAndSend(text: string) {
  await userEvent.type(await screen.findByRole("textbox", { name: "Message" }), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("chat page", () => {
  beforeEach(() => {
    streamMock.mockReset();
    push.mockReset();
  });

  afterEach(() => {
    toast.dismiss();
    vi.unstubAllGlobals();
  });

  it("the messages show in order, and *waves* shows as an em element", async () => {
    stubApi();
    withClient(<ChatView chatId="chat1" />);
    const log = await screen.findByRole("log");
    const texts = within(log)
      .getAllByRole("article")
      .map((node) => node.textContent);
    expect(texts[0]).toContain("waves Hi!");
    expect(texts[1]).toContain("Hello");
    expect(within(log).getByText("waves").tagName).toBe("EM");
    expect(screen.getByRole("heading", { name: "Onnit" })).toBeInTheDocument();
  });

  it("a send shows the user message, then the reply grows with each delta", async () => {
    stubApi();
    let release = () => {};
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "How are you?", 2) });
      onEvent({ type: "delta", text: "Fine" });
      await new Promise<void>((resolve) => (release = resolve));
      onEvent({ type: "delta", text: ", thanks" });
      onEvent({ type: "done", message: message("m3", "assistant", "Fine, thanks", 3) });
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("How are you?");
    expect(streamMock).toHaveBeenCalledWith("/chats/chat1/messages", { content: "How are you?" }, expect.anything());
    expect(await screen.findByText("How are you?")).toBeInTheDocument();
    expect(await screen.findByText("Fine")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    release();
    expect(await screen.findByText("Fine, thanks")).toBeInTheDocument();
  });

  it("Stop calls abort on the signal", async () => {
    stubApi();
    let signal: AbortSignal | undefined;
    streamMock.mockImplementation(
      (_path, _body, options) =>
        new Promise<void>((resolve) => {
          signal = options.signal;
          options.signal.addEventListener("abort", () => resolve());
        }),
    );
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.queryByText("Onnit is typing")).not.toBeInTheDocument();
  });

  it("before the first text comes, three dots show that the character is typing", async () => {
    stubApi();
    let release = () => {};
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
      await new Promise<void>((resolve) => (release = resolve));
      onEvent({ type: "delta", text: "Hey" });
      await new Promise<void>(() => {});
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    expect(await screen.findByText("Onnit is typing")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Hey")).toBeInTheDocument();
    expect(screen.queryByText("Onnit is typing")).not.toBeInTheDocument();
  });

  it('an error event invalid_key shows a toast "The proxy refused the API key." with a step and an Open Settings button', async () => {
    stubApi();
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
      onEvent({ type: "error", error: "invalid_key", message: null });
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    expect(await screen.findByText("The proxy refused the API key.")).toBeInTheDocument();
    expect(screen.getByText("Check the API key of your model in Settings.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(push).toHaveBeenCalledWith("/settings/models");
  });

  it("an error that comes after the user leaves the chat shows no toast", async () => {
    stubApi();
    let fail = () => {};
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
      await new Promise<void>((resolve) => (fail = resolve));
      onEvent({ type: "error", error: "invalid_key", message: null });
    });
    render(<Toaster />);
    const view = withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    expect(await screen.findByText("Onnit is typing")).toBeInTheDocument();
    view.unmount();
    fail();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("The proxy refused the API key.")).not.toBeInTheDocument();
  });

  it("an error event provider_error shows a toast with a step and no Settings button", async () => {
    stubApi();
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
      onEvent({ type: "error", error: "provider_error", message: null });
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    expect(await screen.findByText("The proxy gave an error.")).toBeInTheDocument();
    expect(screen.getByText("This problem is usually short. Try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Settings" })).not.toBeInTheDocument();
  });

  it("Edit, then Save, sends PATCH with the new text, and an assistant message has no Edit", async () => {
    const fetchMock = stubApi();
    withClient(<ChatView chatId="chat1" />);
    const log = await screen.findByRole("log");
    const [opening, mine] = within(log).getAllByRole("article");
    expect(within(opening!).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await userEvent.click(within(mine!).getByRole("button", { name: "Edit" }));
    const editor = within(mine!).getByRole("textbox", { name: "Edit message" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "Hello again");
    await userEvent.click(within(mine!).getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/messages\/m1$/),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ content: "Hello again" }) }),
      ),
    );
    expect(await within(log).findByText("Hello again")).toBeInTheDocument();
  });

  it('canSend false shows "This character is no longer available." and no text box', async () => {
    stubApi({ ...detail, canSend: false });
    withClient(<ChatView chatId="chat1" />);
    expect(await screen.findByText("This character is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });

  it("after Stop, the part that came stays on the page, and the chat loads again with the saved part", async () => {
    let saved = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/me")) {
        return Response.json(me);
      }
      const messages = saved ? [...detail.messages, message("m3", "assistant", "Half a reply", 3)] : detail.messages;
      return Response.json({ ...detail, messages });
    });
    vi.stubGlobal("fetch", fetchMock);
    streamMock.mockImplementation(
      (_path, _body, options) =>
        new Promise<void>((resolve) => {
          options.onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
          options.onEvent({ type: "delta", text: "Half a reply" });
          options.signal.addEventListener("abort", () => {
            // The API saves the part after it sees the closed connection, a short time after the Stop.
            setTimeout(() => (saved = true), 100);
            resolve();
          });
        }),
    );
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(screen.getByText("Half a reply")).toBeInTheDocument();
    const chatLoads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/chats/chat1")).length;
    await vi.waitFor(() => expect(chatLoads()).toBe(2), { timeout: 2000 });
    expect(await screen.findByText("Half a reply")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
