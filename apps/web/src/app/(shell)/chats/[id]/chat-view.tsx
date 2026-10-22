"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_ERROR_TEXT, type ChatDetail, isAiErrorCode, type MessageView } from "@wanderer/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ApiError, apiFetch, fileSrc } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import { useRequireLogin } from "@/lib/use-require-login";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { NewChoicesButton, ReplyChoices, ReplyChoicesSwitch, useReplyChoices } from "./reply-choices";

/** The reply that streams now. replaceId is the reply that a Regenerate replaces. */
interface LiveReply {
  replaceId: string | null;
  text: string;
  /** True after a Stop, while the page waits for the API to save the part that came. */
  stopped?: boolean;
}

/** The API saves the part of a stopped reply after it sees the closed connection, so wait this long first. */
const STOP_SETTLE_MS = 500;

/** The text for an error before the stream starts, such as a busy chat or no active proxy. */
function sendErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
  if (isAiErrorCode(code)) {
    return AI_ERROR_TEXT[code];
  }
  if (code === "chat_busy") {
    return "A reply is already on its way. Wait for it, then send again.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "You sent many messages in a short time. Wait a minute, then try again.";
  }
  return "The message did not send. Try again.";
}

/** The chat page: the character at the top, the messages, and the text box. The AI reply streams in. */
export function ChatView({ chatId }: { chatId: string }) {
  const me = useRequireLogin();
  const queryClient = useQueryClient();
  const queryKey = ["chat", chatId];
  const chat = useQuery({
    queryKey,
    queryFn: () => apiFetch<ChatDetail>(`/chats/${chatId}`),
    enabled: me !== undefined,
  });
  const [text, setText] = useState("");
  const [live, setLive] = useState<LiveReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Goes up after each full reply, so the reply choices ask for a new set.
  const [replyRound, setReplyRound] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // The choices answer the last AI reply, so they hide when the last message is the user's.
  const lastMessage = chat.data?.messages.at(-1);
  const choices = useReplyChoices(
    chatId,
    replyRound,
    Boolean(me?.replyChoicesOn && me.activeProxy && chat.data?.canSend) &&
      live === null &&
      lastMessage?.role === "assistant" &&
      lastMessage.position > 0,
  );

  function patchChat(change: (detail: ChatDetail) => ChatDetail) {
    queryClient.setQueryData<ChatDetail>(queryKey, (detail) => detail && change(detail));
  }

  function upsert(message: MessageView) {
    patchChat((detail) => ({
      ...detail,
      messages: detail.messages.some((item) => item.id === message.id)
        ? detail.messages.map((item) => (item.id === message.id ? message : item))
        : [...detail.messages, message],
    }));
  }

  async function run(path: string, body: unknown, replaceId: string | null) {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setLive({ replaceId, text: "" });
    let ended = false;
    try {
      await streamChat(path, body, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "start") {
            if (event.userMessage) {
              upsert(event.userMessage);
              setText("");
            }
          } else if (event.type === "delta") {
            setLive((current) => current && { ...current, text: current.text + event.text });
          } else if (event.type === "done") {
            ended = true;
            upsert(event.message);
            setReplyRound((round) => round + 1);
          } else {
            ended = true;
            if (event.message) {
              upsert(event.message);
            }
            setError(AI_ERROR_TEXT[event.error]);
          }
        },
      });
    } catch (caught) {
      setError(sendErrorText(caught));
    } finally {
      abortRef.current = null;
      if (!ended && controller.signal.aborted) {
        // Keep the part that came on the page until the chat loads again with the saved part.
        setLive((current) => current && { ...current, stopped: true });
        await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_MS));
        await queryClient.invalidateQueries({ queryKey });
      } else if (!ended) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setLive(null);
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  }

  async function saveEdit(id: string, content: string) {
    upsert(await apiFetch<MessageView>(`/messages/${id}`, { method: "PATCH", body: JSON.stringify({ content }) }));
  }

  async function remove(id: string) {
    await apiFetch(`/messages/${id}`, { method: "DELETE" });
    patchChat((detail) => ({ ...detail, messages: detail.messages.filter((item) => item.id !== id) }));
  }

  if (chat.isError) {
    const missing = chat.error instanceof ApiError && chat.error.status === 404;
    return (
      <div className="flex flex-col gap-3 px-7 pt-7 max-[760px]:px-4">
        <p className="m-0 text-error">{missing ? "This chat does not exist." : "The chat did not load. Reload the page."}</p>
        <Link href="/" className="pill pill-soft self-start">
          Go to Discover
        </Link>
      </div>
    );
  }
  if (!chat.data || !me) {
    return <p className="m-0 px-7 pt-7 text-muted">Loading the chat…</p>;
  }

  const { chat: summary, messages, canSend } = chat.data;
  const character = {
    name: summary.character.chatName || summary.character.title,
    src: summary.character.avatarUrl ? fileSrc(summary.character.avatarUrl) : null,
  };
  const user = { name: me.name, src: me.pictureUrl };
  const shown = live?.replaceId ? messages.filter((message) => message.id !== live.replaceId) : messages;
  const last = messages.at(-1);
  const idle = live === null;
  const regenerate = () => void run(`/chats/${chatId}/regenerate`, {}, last?.role === "assistant" ? last.id : null);
  const send = (content: string) => void run(`/chats/${chatId}/messages`, { content }, null);

  return (
    <div className="flex h-screen flex-col max-[760px]:h-[85dvh]">
      <header className="flex items-center gap-3 border-b border-line px-7 py-3.5 max-[760px]:px-4">
        <Avatar name={character.name} src={character.src} size={44} />
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 truncate text-lg font-bold">{summary.title}</h1>
          <Link href={`/characters/${summary.character.id}`} className="text-sm text-link">
            Character page
          </Link>
        </div>
      </header>

      {/* column-reverse keeps the newest message in view without a scroll script. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-7 py-5 max-[760px]:px-4">
        <div role="log" aria-label="Messages" aria-live="polite" className="flex flex-col gap-5">
          {shown.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              speaker={message.role === "user" ? user : character}
              editable={message.role === "user" && idle}
              canRegenerate={canSend && idle && message.id === last?.id && message.role === "assistant" && message.position > 0}
              onSave={(content) => saveEdit(message.id, content)}
              onDelete={() => remove(message.id)}
              onRegenerate={regenerate}
            />
          ))}
          {live && <MessageItem message={{ role: "assistant", content: live.text || "…" }} speaker={character} />}
          {canSend && idle && last?.role === "user" && (
            <button type="button" className="pill pill-soft pill-sm self-start" onClick={regenerate}>
              Get a reply
            </button>
          )}
          {error && (
            <p role="alert" className="m-0 text-error">
              {error}
            </p>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-2 px-7 pb-5 max-[760px]:px-4">
        {canSend ? (
          <>
            {!me.activeProxy && (
              <p className="m-0 text-muted">
                You have no model yet.{" "}
                <Link href="/settings/models" className="text-link">
                  Add a model
                </Link>{" "}
                to start chatting.
              </p>
            )}
            <ReplyChoices state={choices} onPick={send} />
            <Composer
              value={text}
              onChange={setText}
              disabled={!me.activeProxy || Boolean(live?.stopped)}
              streaming={live !== null && !live.stopped}
              onSend={send}
              onStop={() => abortRef.current?.abort()}
              toolbar={
                <>
                  <ReplyChoicesSwitch me={me} />
                  <NewChoicesButton state={choices} />
                </>
              }
            />
          </>
        ) : (
          <p className="m-0 rounded-[14px] bg-surface px-4 py-3 text-muted">This character is no longer available.</p>
        )}
      </footer>
    </div>
  );
}
