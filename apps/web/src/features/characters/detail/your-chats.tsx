"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListResponse, ChatSummary } from "@wanderer/shared";
import Link from "next/link";
import { useId, useState } from "react";
import { InlineMarkdown } from "@/components/ui/markdown";
import { apiFetch } from "@/lib/api";
import { messagesLabel } from "@/lib/format";
import { useMe } from "@/lib/query-provider";

function ChatRow({ chat, onDeleted }: { chat: ChatSummary; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    try {
      await apiFetch(`/chats/${chat.id}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate [&_em]:text-muted">
            <InlineMarkdown text={chat.lastMessage} />
          </span>
          <span className="text-sm text-muted">
            {new Date(chat.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
            {messagesLabel(chat.messageCount)}
          </span>
        </div>
        <div className="flex gap-2">
          <Link href={`/chats/${chat.id}`} className="pill pill-soft pill-sm">
            Open
          </Link>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Delete this chat">
          <span>Delete this chat? You cannot undo this.</span>
          <button type="button" className="pill pill-danger pill-sm" onClick={remove}>
            Yes, delete
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="m-0 text-error">The chat did not delete. Try again.</p>}
    </li>
  );
}

/** The chats of the signed-in user with this character, newest first. A visitor gets no list. */
export function useCharacterChats(characterId: string) {
  const { data: me } = useMe();
  return useQuery({
    // The key starts with "chats", so a new chat or a delete loads this list again.
    queryKey: ["chats", "character", characterId],
    queryFn: () => apiFetch<ChatListResponse>(`/chats?characterId=${characterId}`),
    enabled: Boolean(me),
  });
}

/** The page shows this number of chats. The other chats open in a dialog, so a long list does not push the page down. */
const PREVIEW_COUNT = 3;

/** All the chats of the user with this character, in a list that scrolls inside the dialog. */
function AllChatsDialog({ items, onDeleted, onClose }: { items: ChatSummary[]; onDeleted: () => void; onClose: () => void }) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[80dvh] w-full max-w-[640px] flex-col gap-4 panel p-5 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-lg font-bold">
            Your chats
          </h2>
          <button type="button" className="pill pill-soft" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <ul className="m-0 flex min-h-0 list-none flex-col gap-2.5 overflow-y-auto p-0">
          {items.map((chat) => (
            <ChatRow key={chat.id} chat={chat} onDeleted={onDeleted} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The chats of this user with this character. It shows nothing for a visitor or when there are no chats. */
export function YourChats({ characterId }: { characterId: string }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const list = useCharacterChats(characterId);
  const [showAll, setShowAll] = useState(false);
  const items = list.data?.items ?? [];
  if (!me || items.length === 0) {
    return null;
  }
  const onDeleted = () => void queryClient.invalidateQueries({ queryKey: ["chats"] });
  return (
    <section aria-labelledby="your-chats-h" className="flex flex-col gap-3">
      <h2 id="your-chats-h" className="m-0 text-lg font-bold">
        Your chats
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.slice(0, PREVIEW_COUNT).map((chat) => (
          <ChatRow key={chat.id} chat={chat} onDeleted={onDeleted} />
        ))}
      </ul>
      {items.length > PREVIEW_COUNT && (
        <button type="button" className="pill pill-soft self-start" onClick={() => setShowAll(true)}>
          Show all {items.length} chats
        </button>
      )}
      {showAll && <AllChatsDialog items={items} onDeleted={onDeleted} onClose={() => setShowAll(false)} />}
    </section>
  );
}
