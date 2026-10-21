"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListResponse, ChatSummary } from "@wanderer/shared";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
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
    <li className="flex flex-col gap-2 rounded-[14px] bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{chat.lastMessage}</span>
          <span className="text-sm text-muted">
            {new Date(chat.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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

/** The chats of this user with this character. It shows nothing for a visitor or when there are no chats. */
export function YourChats({ characterId }: { characterId: string }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const list = useQuery({
    // The key starts with "chats", so a new chat or a delete loads this list again.
    queryKey: ["chats", "character", characterId],
    queryFn: () => apiFetch<ChatListResponse>(`/chats?characterId=${characterId}`),
    enabled: Boolean(me),
  });
  const items = list.data?.items ?? [];
  if (!me || items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="your-chats-h" className="flex flex-col gap-3">
      <h2 id="your-chats-h" className="m-0 text-lg font-bold">
        Your chats
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((chat) => (
          <ChatRow key={chat.id} chat={chat} onDeleted={() => void queryClient.invalidateQueries({ queryKey: ["chats"] })} />
        ))}
      </ul>
    </section>
  );
}
