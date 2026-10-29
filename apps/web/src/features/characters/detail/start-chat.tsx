"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ChatDetail } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { useCharacterChats } from "./your-chats";

/** Starts a new chat with the character and opens it. `error` is true when the start failed. */
export function useStartChat(characterId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setStarting(true);
    setError(false);
    try {
      const created = await apiFetch<ChatDetail>("/chats", {
        method: "POST",
        body: JSON.stringify({ characterId }),
      });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
      router.push(`/chats/${created.chat.id}`);
    } catch {
      setError(true);
      setStarting(false);
    }
  }

  return { start, starting, error };
}

/**
 * "Continue latest chat" and "Start a new chat". A new chat starts with the first opening.
 * The user picks the opening in the chat, so this page shows no opening text.
 */
export function StartChat({ characterId }: { characterId: string }) {
  const { data: me, isPending } = useMe();
  const latest = useCharacterChats(characterId).data?.items[0];
  const { start, starting, error } = useStartChat(characterId);

  if (isPending) {
    return null;
  }
  return (
    <section aria-label="Start a chat" className="flex flex-col gap-2">
      {me ? (
        <div className="flex flex-wrap gap-2">
          {latest && (
            <Link href={`/chats/${latest.id}`} className="pill pill-accent">
              Continue latest chat
            </Link>
          )}
          <button type="button" className={`pill ${latest ? "pill-soft" : "pill-accent"}`} disabled={starting} onClick={() => void start()}>
            Start a new chat
          </button>
        </div>
      ) : (
        <Link href="/login" className="pill pill-accent self-start">
          Log in to chat
        </Link>
      )}
      {error && <p className="m-0 text-error">The chat did not start. Try again.</p>}
    </section>
  );
}
