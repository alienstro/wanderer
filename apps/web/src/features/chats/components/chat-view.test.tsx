import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatDetail, ChatStreamEvent, MessageView, SceneView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { ApiError } from "@/lib/api";
import { ChatView } from "./chat-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/chats/chat1" }));

type StreamOptions = { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void };
const streamMock = vi.fn<(path: string, body: unknown, options: StreamOptions) => Promise<void>>();
vi.mock("@/features/chats/chat-stream", () => ({
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
    messageCount: 2,
  },
  messages: [message("m0", "assistant", "*waves* Hi!", 0), message("m1", "user", "Hello", 1)],
  memory: { text: "", throughPosition: null },
  canSend: true,
  opening: { index: 0, count: 1 },
  scenes: [],
};

function stubApi(chat: ChatDetail = detail) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) {
      return Response.json(me);
    }
    if (url.endsWith("/chats/chat1/memory") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { memory: string };
      return Response.json({ text: body.memory, throughPosition: null });
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

  it("a send shows the user message at once, before the API saves it", async () => {
    stubApi();
    streamMock.mockImplementation(() => new Promise<void>(() => {}));
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("How are you?");
    const log = screen.getByRole("log", { name: "Messages" });
    expect(within(log).getByText("How are you?")).toBeInTheDocument();
    expect(within(log).getByText("Onnit is typing")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("a send that fails before the API saves it removes the message and puts the text back in the box", async () => {
    stubApi();
    streamMock.mockRejectedValue(new ApiError(409, "chat_busy"));
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("How are you?");
    expect(await screen.findByText("A reply is already on its way. Wait for it, then send again.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("How are you?");
    expect(within(screen.getByRole("log", { name: "Messages" })).queryByText("How are you?")).not.toBeInTheDocument();
  });

  it("a Stop before the API saves the message puts the text back in the box", async () => {
    stubApi();
    streamMock.mockImplementation(
      (_path, _body, options) => new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve())),
    );
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("How are you?");
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await vi.waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("How are you?"));
    expect(within(screen.getByRole("log", { name: "Messages" })).queryByText("How are you?")).not.toBeInTheDocument();
  });

  it("a lost connection after the API saved the message does not put the text back, so it is not sent two times", async () => {
    const chat: ChatDetail = { ...detail, messages: [...detail.messages] };
    stubApi(chat);
    streamMock.mockImplementation(async () => {
      chat.messages.push(message("m2", "user", "How are you?", 2));
      throw new Error("network");
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("How are you?");
    expect(await screen.findByText("The message did not send. Try again.")).toBeInTheDocument();
    await vi.waitFor(() => expect(within(screen.getByRole("log", { name: "Messages" })).getByText("How are you?")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("text typed while a send waits stays, and a failed send puts its text back above it", async () => {
    stubApi();
    let fail = () => {};
    streamMock.mockImplementation(
      () => new Promise<void>((_resolve, reject) => (fail = () => reject(new ApiError(409, "chat_busy")))),
    );
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("First");
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Second");
    fail();
    await vi.waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("First\nSecond"));
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

  it("an error event usage_limit shows a usage-limit toast that does not say to wait a minute", async () => {
    stubApi();
    streamMock.mockImplementation(async (_path, _body, { onEvent }) => {
      onEvent({ type: "start", userMessage: message("m2", "user", "Hi", 2) });
      onEvent({ type: "error", error: "usage_limit", message: null });
    });
    withClient(<ChatView chatId="chat1" />);
    await typeAndSend("Hi");
    expect(await screen.findByText("The proxy account reached its usage limit.")).toBeInTheDocument();
    expect(screen.getByText("Add credit or a plan on the proxy site, or pick a different model.")).toBeInTheDocument();
    expect(screen.queryByText(/wait a minute/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
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

  it("the Memory button shows the saved memory, and a save updates the copy of the page", async () => {
    stubApi({ ...detail, memory: { text: "Old fact.", throughPosition: null } });
    withClient(<ChatView chatId="chat1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Memory" }));
    const box = screen.getByLabelText("Memory text");
    expect(box).toHaveValue("Old fact.");
    await userEvent.clear(box);
    await userEvent.type(box, "New fact.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Memory" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Memory" }));
    expect(screen.getByLabelText("Memory text")).toHaveValue("New fact.");
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

  describe("the opening picker", () => {
    const openings = ["*waves* Hi!", "*frowns* You again?", "*sleeps*"];
    const openingOnly = (index: number): ChatDetail => ({
      ...detail,
      chat: { ...detail.chat, lastMessage: openings[index] ?? "", messageCount: 1 },
      messages: [message("m0", "assistant", openings[index] ?? "", 0)],
      opening: { index, count: 3 },
    });

    /** The API of an opening-only chat. `answer` gives the response of the PATCH. */
    function stubOpenings(answer: (index: number) => Promise<Response> | Response = (index) => Response.json(openingOnly(index))) {
      let current = openingOnly(0);
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/me")) {
          return Response.json(me);
        }
        if (url.endsWith("/chats/chat1/opening") && init?.method === "PATCH") {
          const { openingIndex } = JSON.parse(String(init.body)) as { openingIndex: number };
          const res = await answer(openingIndex);
          if (res.ok) {
            current = openingOnly(openingIndex);
          }
          return res;
        }
        return url.endsWith("/chats/chat1") ? Response.json(current) : Response.json({ error: "not_found" }, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("an opening-only chat with 3 openings shows 1 / 3 and only Next opening", async () => {
      stubOpenings();
      withClient(<ChatView chatId="chat1" />);
      expect(await screen.findByText("1 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next opening" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Previous opening" })).not.toBeInTheDocument();
    });

    it("Next opening sends PATCH with openingIndex 1 and shows 2 / 3, then Previous opening goes back to 1 / 3", async () => {
      const fetchMock = stubOpenings();
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Next opening" }));
      expect(await screen.findByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByText("You again?", { exact: false })).toBeInTheDocument();
      const patch = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/opening") && init?.method === "PATCH");
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ openingIndex: 1 });
      await userEvent.click(screen.getByRole("button", { name: "Previous opening" }));
      expect(await screen.findByText("1 / 3")).toBeInTheDocument();
    });

    it("the arrows are disabled while the PATCH runs", async () => {
      let finish = () => {};
      stubOpenings((index) => new Promise((resolve) => (finish = () => resolve(Response.json(openingOnly(index))))));
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Next opening" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Next opening" })).toBeDisabled());
      finish();
      expect(await screen.findByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next opening" })).toBeEnabled();
    });

    it("a 409 opening_locked loads the chat again", async () => {
      const fetchMock = stubOpenings(() => Response.json({ error: "opening_locked" }, { status: 409 }));
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Next opening" }));
      const chatLoads = () => fetchMock.mock.calls.filter(([url, init]) => url.endsWith("/chats/chat1") && !init?.method).length;
      await waitFor(() => expect(chatLoads()).toBe(2));
    });

    it("another error shows a short message and keeps the opening", async () => {
      stubOpenings(() => Response.json({ error: "server_error" }, { status: 500 }));
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Next opening" }));
      expect(await screen.findByText("The opening did not change. Try again.")).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("no arrows when the chat has a user message, when the character has one opening, or when canSend is false", async () => {
      stubApi({ ...detail, opening: { index: 0, count: 3 } });
      const first = withClient(<ChatView chatId="chat1" />);
      expect(await screen.findByText("Hello")).toBeInTheDocument();
      expect(screen.queryByText("1 / 3")).not.toBeInTheDocument();
      first.unmount();

      stubApi({ ...openingOnly(0), opening: { index: 0, count: 1 } });
      const second = withClient(<ChatView chatId="chat1" />);
      expect(await screen.findByText("Hi!", { exact: false })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next opening" })).not.toBeInTheDocument();
      expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
      second.unmount();

      stubApi({ ...openingOnly(0), canSend: false });
      withClient(<ChatView chatId="chat1" />);
      expect(await screen.findByText("Hi!", { exact: false })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next opening" })).not.toBeInTheDocument();
    });
  });

  describe("scene images", () => {
    const scene: SceneView = { id: "s1", url: "/files/f1", afterPosition: 0, createdAt: "2026-10-21T00:00:00.000Z" };

    /** The chat API, plus POST /chats/chat1/scenes. Each POST takes the next answer. */
    function stubScenes(answers: Array<() => Promise<Response> | Response>) {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/me")) {
          return Response.json(me);
        }
        if (url.endsWith("/chats/chat1/scenes") && init?.method === "POST") {
          return answers.shift()!();
        }
        return url.endsWith("/chats/chat1") ? Response.json(detail) : Response.json({ error: "not_found" }, { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    const scenePosts = (fetchMock: ReturnType<typeof stubScenes>) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/scenes")).length;

    it("a saved scene shows as an image after the message at its position", async () => {
      stubApi({ ...detail, scenes: [scene] });
      withClient(<ChatView chatId="chat1" />);
      const image = await screen.findByRole("img", { name: "Scene image" });
      expect(image.getAttribute("src")).toMatch(/\/files\/f1$/);
      const log = screen.getByRole("log");
      const order = Array.from(log.children).map((node) => (node.querySelector("img[alt='Scene image']") ? "scene" : node.textContent));
      expect(order[1]).toBe("scene");
      expect(order[2]).toContain("Hello");
    });

    it("a click makes one scene: the button waits and is disabled, then the image shows", async () => {
      let finish!: (res: Response) => void;
      const fetchMock = stubScenes([() => new Promise((resolve) => (finish = resolve))]);
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Generate scene" }));
      const busy = await screen.findByRole("button", { name: "Making the scene…" });
      expect(busy).toBeDisabled();
      await userEvent.click(busy);
      expect(scenePosts(fetchMock)).toBe(1);
      finish(Response.json({ ...scene, afterPosition: 1 }));
      expect(await screen.findByRole("img", { name: "Scene image" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Generate scene" })).toBeEnabled();
    });

    it("a failed job shows a clear error, and the user can try again", async () => {
      const fetchMock = stubScenes([
        () => Response.json({ error: "scene_failed" }, { status: 502 }),
        () => Response.json(scene, { status: 201 }),
      ]);
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Generate scene" }));
      expect(await screen.findByText("The scene image did not generate. Try again.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Generate scene" }));
      expect(await screen.findByRole("img", { name: "Scene image" })).toBeInTheDocument();
      expect(scenePosts(fetchMock)).toBe(2);
    });

    it("the daily limit shows its own message", async () => {
      stubScenes([() => Response.json({ error: "scene_limit" }, { status: 429 })]);
      withClient(<ChatView chatId="chat1" />);
      await userEvent.click(await screen.findByRole("button", { name: "Generate scene" }));
      expect(await screen.findByText("You made the most scene images for today. Try again tomorrow.")).toBeInTheDocument();
    });
  });
});
