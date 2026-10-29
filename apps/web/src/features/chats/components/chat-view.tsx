"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_ERROR_TEXT, type AiErrorCode, type ChatDetail, isAiErrorCode, type MessageView } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch, fileSrc } from "@/lib/api";
import { streamChat } from "@/features/chats/chat-stream";
import { ENERGY_LOW_TITLE, energyLowText, useEnergy, useRefreshEnergy } from "@/features/energy";
import { useMediaQuery } from "@/lib/use-media-query";
import { useRequireLogin } from "@/lib/use-require-login";
import { AI_ERROR_STEP, sendErrorText } from "./chat-errors";
import { ChatGlow, ChatIntro } from "./chat-intro";
import { PanelAside, PanelToggle } from "./chat-panel";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { OpeningSwitcher } from "./opening-switcher";
import { GenerateSceneButton, SceneImage, sceneErrorText, scenesAfter, useSceneJob } from "@/features/chats/scenes/scene-image";
import { NewChoicesButton, ReplyChoices, ReplyChoicesSwitch, useReplyChoices } from "@/features/chats/choices/reply-choices";

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
 * The start of the toast id of the chat errors. A new error replaces the old one, and a new send removes it.
 * The toast stays until the user closes it, because it tells the user what to do next.
 */
const ERROR_TOAST_PREFIX = "chat-error";

/** The centred column of the messages and the text box, so the text box lines up with the messages. */
const CHAT_COLUMN = "mx-auto w-full max-w-[712px]";


/** The chat page: the character at the top, the messages, and the text box. The AI reply streams in. */
export function ChatView({ chatId }: { chatId: string }) {
  const me = useRequireLogin();
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = ["chat", chatId];
  const energy = useEnergy();
  const refreshEnergy = useRefreshEnergy();
  // A user with no own key chats on a free model, and GET /energy names that model. The notice waits for the energy load.
  const hasModel = Boolean(me?.activeProxy) || Boolean(energy.data?.model);
  const noModel = !me?.activeProxy && energy.data?.model === null;
  const chat = useQuery({
    queryKey,
    queryFn: () => apiFetch<ChatDetail>(`/chats/${chatId}`),
    enabled: me !== undefined,
  });
  const [text, setText] = useState("");
  // The character panel shows at the start on a computer, and stays closed on a phone, where it covers the chat.
  const isPhone = useMediaQuery("(max-width: 760px)");
  const [panelPicked, setPanelPicked] = useState<boolean | null>(null);
  const panelOpen = panelPicked ?? !isPhone;
  const [live, setLive] = useState<LiveReply | null>(null);
  // Goes up after each full reply, so the reply choices ask for a new set.
  const [replyRound, setReplyRound] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // Goes up at each send and each scene. Sonner removes a dismissed id two frames late, so a fast error of the new
  // action must use a new id. With the old id, the late dismiss removes the new toast.
  const toastRoundRef = useRef(0);
  const errorToastId = () => `${ERROR_TOAST_PREFIX}-${toastRoundRef.current}`;
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
    Boolean(me?.replyChoicesOn && hasModel && chat.data?.canSend) &&
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
      const energyLow = energyLowText(error, "scene");
      if (energyLow) {
        showEnergyLow(energyLow);
      } else if (isAiErrorCode(code)) {
        showAiError(code);
      } else if (mountedRef.current) {
        toast.error(sceneErrorText(error), { id: errorToastId(), duration: Number.POSITIVE_INFINITY });
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
      id: errorToastId(),
      description: step.text,
      duration: Number.POSITIVE_INFINITY,
      action: step.settings ? { label: "Open Settings", onClick: () => router.push("/settings/models") } : undefined,
    });
  }

  /** Removes the error toast of the last action. The errors of the next action use a new toast id. */
  function clearErrorToast() {
    toast.dismiss(errorToastId());
    toastRoundRef.current += 1;
  }

  /** The action costs more than the balance. The text has the price, the balance and the refill time. */
  function showEnergyLow(text: string) {
    if (mountedRef.current) {
      toast.error(ENERGY_LOW_TITLE, { id: errorToastId(), description: text, duration: Number.POSITIVE_INFINITY });
    }
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
    clearErrorToast();
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
      const energyLow = energyLowText(caught, "reply");
      if (energyLow) {
        showEnergyLow(energyLow);
      } else if (isAiErrorCode(code)) {
        showAiError(code);
      } else if (mountedRef.current) {
        toast.error(sendErrorText(caught), { id: errorToastId(), duration: Number.POSITIVE_INFINITY });
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
      // The API takes the price before the reply and gives it back on a failure, so each end can change the balance.
      refreshEnergy();
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
    <div className="flex h-screen max-[760px]:h-[calc(100dvh-56px)]">
      <section aria-label="Chat" className="relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0b0d]">
        <ChatGlow src={character.src} />
        <PanelToggle open={panelOpen} onToggle={() => setPanelPicked(!panelOpen)} />

        {/* column-reverse keeps the newest message in view without a scroll script. */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-6 pt-10 pb-3 max-[760px]:px-3 max-[760px]:pt-2">
          <div className={`${CHAT_COLUMN} flex flex-col gap-3.5`}>
            <ChatIntro
              name={character.name}
              src={character.src}
              title={summary.title}
              characterId={summary.character.id}
              personaName={chat.data.personaName}
            />
            <div role="log" aria-label="Messages" aria-live="polite" className="flex flex-col gap-3.5">
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
        </div>

        <footer className="px-6 pt-2 pb-5 max-[760px]:px-3 max-[760px]:pb-3">
          <div className={`${CHAT_COLUMN} flex flex-col gap-2`}>
            {canSend ? (
              <>
                {noModel && (
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
                  characterName={character.name}
                  value={text}
                  onChange={setText}
                  disabled={!hasModel || Boolean(live?.stopped)}
                  streaming={live !== null && !live.stopped}
                  onSend={(content) => send(content, true)}
                  onStop={() => abortRef.current?.abort()}
                  leading={<ReplyChoicesSwitch me={me} />}
                  toolbar={
                    <>
                      <NewChoicesButton state={choices} />
                      <GenerateSceneButton
                        busy={sceneJob.isPending}
                        disabled={!hasModel}
                        price={energy.data?.prices.scene}
                        onClick={() => {
                          clearErrorToast();
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
      </section>
      {panelOpen && (
        <PanelAside
          onClose={() => setPanelPicked(false)}
          chatId={chatId}
          characterId={summary.character.id}
          personaName={chat.data.personaName}
          memory={chat.data.memory}
          scenes={scenes}
          onMemorySaved={(memory) => patchChat((detail) => ({ ...detail, memory }))}
        />
      )}
    </div>
  );
}
