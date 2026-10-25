"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_ERROR_TEXT, type AiErrorCode, type ChatDetail, isAiErrorCode, type MessageView } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { ApiError, apiFetch, fileSrc } from "@/lib/api";
import { streamChat } from "@/lib/chat-stream";
import { useRequireLogin } from "@/lib/use-require-login";
import { Composer } from "./composer";
import { MemoryButton } from "./memory-panel";
import { MessageItem } from "./message-item";
import { OpeningSwitcher } from "./opening-switcher";
import { GenerateSceneButton, SceneImage, sceneErrorText, scenesAfter, useSceneJob } from "./scene-image";
import { NewChoicesButton, ReplyChoices, ReplyChoicesSwitch, useReplyChoices } from "./reply-choices";

/** The reply that streams now. replaceId is the reply that a Regenerate replaces. */
interface LiveReply {
  replaceId: string | null;
  text: string;
  /** The text that the user sent and the API did not save yet. It shows at once as the user's message. */
  sending: string | null;
  /** True after a Stop, while the page waits for the API to save the part that came. */
  stopped?: boolean;
}

/** A user message that the page shows before the API saves it. fromBox is false for a click on a reply choice. */
interface Sending {
  text: string;
  fromBox: boolean;
}

/** The API saves the part of a stopped reply after it sees the closed connection, so wait this long first. */
const STOP_SETTLE_MS = 500;

/**
 * One toast id for the chat errors, so a new error replaces the old one and a new send removes it.
 * The toast stays until the user closes it, because it tells the user what to do next.
 */
const ERROR_TOAST_ID = "chat-error";

/** The centred column of the messages and the text box, so the text box lines up with the messages. */
const CHAT_COLUMN = "mx-auto w-full max-w-[832px]";

/** The next step for each AI error. "settings" adds a button that opens the model page. */
const AI_ERROR_STEP: Record<AiErrorCode, { text: string; settings?: boolean }> = {
  no_active_proxy: { text: "Add a model, then send your message again.", settings: true },
  invalid_key: { text: "Check the API key of your model in Settings.", settings: true },
  model_not_found: { text: "Check the model name in Settings.", settings: true },
  no_credit: { text: "Add credit on the proxy site, then try again." },
  usage_limit: { text: "Add credit or a plan on the proxy site, or pick a different model.", settings: true },
  rate_limited: { text: "Wait a minute, then try again." },
  timeout: { text: "Try again. If the problem continues, use a faster model." },
  blocked_url: { text: "Use a different proxy URL in Settings.", settings: true },
  provider_unreachable: { text: "Check the proxy URL in Settings, or try again later.", settings: true },
  provider_error: { text: "This problem is usually short. Try again in a moment." },
};

/** The text for an error before the stream starts, such as a busy chat or a rate limit. */
function sendErrorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : null;
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
  const router = useRouter();
  const queryKey = ["chat", chatId];
  const chat = useQuery({
    queryKey,
    queryFn: () => apiFetch<ChatDetail>(`/chats/${chatId}`),
    enabled: me !== undefined,
  });
  const [text, setText] = useState("");
  const [live, setLive] = useState<LiveReply | null>(null);
  // Goes up after each full reply, so the reply choices ask for a new set.
  const [replyRound, setReplyRound] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // The stream continues after the user leaves the chat, so the reply saves. Its error must not show on the next page.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
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

  const sceneJob = useSceneJob(
    chatId,
    (scene) => patchChat((detail) => ({ ...detail, scenes: [...detail.scenes, scene] })),
    (error) => {
      const code = error instanceof ApiError ? error.code : null;
      if (isAiErrorCode(code)) {
        showAiError(code);
      } else if (mountedRef.current) {
        toast.error(sceneErrorText(error), { id: ERROR_TOAST_ID, duration: Number.POSITIVE_INFINITY });
      }
    },
  );

  function upsert(message: MessageView) {
    patchChat((detail) => ({
      ...detail,
      messages: detail.messages.some((item) => item.id === message.id)
        ? detail.messages.map((item) => (item.id === message.id ? message : item))
        : [...detail.messages, message],
    }));
  }

  function showAiError(code: AiErrorCode) {
    if (!mountedRef.current) {
      return;
    }
    const step = AI_ERROR_STEP[code];
    toast.error(AI_ERROR_TEXT[code], {
      id: ERROR_TOAST_ID,
      description: step.text,
      duration: Number.POSITIVE_INFINITY,
      action: step.settings ? { label: "Open Settings", onClick: () => router.push("/settings/models") } : undefined,
    });
  }

  /**
   * Gives the text of a send back when the API did not save it. The chat loads again first, because the API can save
   * the message and then lose the connection before the page reads the start event.
   */
  async function giveBack(sending: Sending) {
    await queryClient.invalidateQueries({ queryKey });
    const latest = queryClient.getQueryData<ChatDetail>(queryKey)?.messages.at(-1);
    if (latest?.role === "user" && latest.content === sending.text) {
      return;
    }
    // Text that the user typed during the send stays. The failed text goes above it.
    setText((current) => (!current ? sending.text : sending.fromBox ? `${sending.text}\n${current}` : current));
  }

  async function run(path: string, body: unknown, replaceId: string | null, sending: Sending | null = null) {
    const controller = new AbortController();
    abortRef.current = controller;
    toast.dismiss(ERROR_TOAST_ID);
    setLive({ replaceId, text: "", sending: sending?.text ?? null });
    if (sending?.fromBox) {
      setText("");
    }
    let saved = false;
    let ended = false;
    try {
      await streamChat(path, body, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "start") {
            if (event.userMessage) {
              saved = true;
              upsert(event.userMessage);
              setLive((current) => current && { ...current, sending: null });
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
            showAiError(event.error);
          }
        },
      });
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      if (isAiErrorCode(code)) {
        showAiError(code);
      } else if (mountedRef.current) {
        toast.error(sendErrorText(caught), { id: ERROR_TOAST_ID, duration: Number.POSITIVE_INFINITY });
      }
    } finally {
      abortRef.current = null;
      if (!ended && controller.signal.aborted) {
        // Keep the part that came on the page until the chat loads again with the saved part.
        setLive((current) => current && { ...current, stopped: true });
        await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_MS));
      }
      if (sending && !saved) {
        await giveBack(sending);
      } else if (!ended) {
        await queryClient.invalidateQueries({ queryKey });
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
    // The chat lists show the number of messages.
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  }

  if (chat.isError) {
    const missing = chat.error instanceof ApiError && chat.error.status === 404;
    return (
      <div className="flex flex-col gap-3 px-7 pt-7 max-[760px]:px-4">
        <p className="m-0 text-error">{missing ? "This chat does not exist." : "The chat did not load. Reload the page."}</p>
        <Link href="/discover" className="pill pill-soft self-start">
          Go to Discover
        </Link>
      </div>
    );
  }
  if (!chat.data || !me) {
    return <p className="m-0 px-7 pt-7 text-muted">Loading the chat…</p>;
  }

  const { chat: summary, messages, canSend, opening, scenes } = chat.data;
  const character = {
    name: summary.character.chatName || summary.character.title,
    src: summary.character.avatarUrl ? fileSrc(summary.character.avatarUrl) : null,
  };
  const user = { name: me.name, src: me.pictureUrl };
  const shown = live?.replaceId ? messages.filter((message) => message.id !== live.replaceId) : messages;
  const last = messages.at(-1);
  const idle = live === null;
  const regenerate = () => void run(`/chats/${chatId}/regenerate`, {}, last?.role === "assistant" ? last.id : null);
  const send = (content: string, fromBox: boolean) =>
    void run(`/chats/${chatId}/messages`, { content }, null, { text: content, fromBox });

  return (
    // On a phone the chat fills the screen under the 56 px top bar of SidebarDrawer.
    <div className="flex h-screen flex-col max-[760px]:h-[calc(100dvh-56px)]">
      <header className="flex items-center gap-3 border-b border-line px-7 py-3.5 max-[760px]:gap-2.5 max-[760px]:px-3 max-[760px]:py-2">
        <Avatar name={character.name} src={character.src} size={44} />
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 truncate text-lg font-bold max-[760px]:text-base">{summary.title}</h1>
          <Link href={`/characters/${summary.character.id}`} className="text-sm text-link">
            Character page
          </Link>
        </div>
        <MemoryButton
          chatId={chatId}
          memory={chat.data.memory}
          onSaved={(memory) => patchChat((detail) => ({ ...detail, memory }))}
        />
      </header>

      {/* column-reverse keeps the newest message in view without a scroll script. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-7 py-5 max-[760px]:px-3 max-[760px]:py-3">
        <div role="log" aria-label="Messages" aria-live="polite" className={`${CHAT_COLUMN} flex flex-col gap-5 max-[760px]:gap-4`}>
          {shown.map((message, index) => (
            <Fragment key={message.id}>
              <MessageItem
                message={message}
                speaker={message.role === "user" ? user : character}
                editable={message.role === "user" && idle}
                canRegenerate={canSend && idle && message.id === last?.id && message.role === "assistant" && message.position > 0}
                onSave={(content) => saveEdit(message.id, content)}
                onDelete={() => remove(message.id)}
                onRegenerate={regenerate}
              />
              {scenesAfter(scenes, message.position, shown[index + 1]?.position).map((scene) => (
                <SceneImage key={scene.id} scene={scene} />
              ))}
            </Fragment>
          ))}
          {/* The user picks the opening until the first message. The server refuses a change after it. */}
          {canSend && idle && messages.length === 1 && opening.count > 1 && (
            <OpeningSwitcher
              chatId={chatId}
              index={opening.index}
              count={opening.count}
              onChanged={(next) => queryClient.setQueryData<ChatDetail>(queryKey, next)}
              onLocked={() => void queryClient.invalidateQueries({ queryKey })}
            />
          )}
          {live?.sending && <MessageItem message={{ role: "user", content: live.sending }} speaker={user} />}
          {live && <MessageItem message={{ role: "assistant", content: live.text }} speaker={character} typing={!live.text && !live.stopped} />}
          {canSend && idle && last?.role === "user" && (
            <button type="button" className="pill pill-soft pill-sm self-start" onClick={regenerate}>
              Get a reply
            </button>
          )}
        </div>
      </div>

      <footer className="px-7 pb-5 max-[760px]:px-3 max-[760px]:pb-3">
        <div className={`${CHAT_COLUMN} flex flex-col gap-2`}>
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
              <ReplyChoices state={choices} onPick={(choice) => send(choice, false)} />
              <Composer
                value={text}
                onChange={setText}
                disabled={!me.activeProxy || Boolean(live?.stopped)}
                streaming={live !== null && !live.stopped}
                onSend={(content) => send(content, true)}
                onStop={() => abortRef.current?.abort()}
                toolbar={
                  <>
                    <ReplyChoicesSwitch me={me} />
                    <NewChoicesButton state={choices} />
                    <GenerateSceneButton
                      busy={sceneJob.isPending}
                      disabled={!me.activeProxy}
                      onClick={() => {
                        toast.dismiss(ERROR_TOAST_ID);
                        sceneJob.mutate();
                      }}
                    />
                  </>
                }
              />
            </>
          ) : (
            <p className="m-0 rounded-[16px] border border-line bg-surface px-4 py-3 text-muted">This character is no longer available.</p>
          )}
        </div>
      </footer>
    </div>
  );
}
