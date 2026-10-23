"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ChatDetail } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

/** "How the story starts": the user picks one opening, then starts a new chat from it. */
export function StartChat({ characterId, openings }: { characterId: string; openings: string[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isPending } = useMe();
  const [chosen, setChosen] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setStarting(true);
    setError(false);
    try {
      const created = await apiFetch<ChatDetail>("/chats", {
        method: "POST",
        body: JSON.stringify({ characterId, openingIndex: chosen }),
      });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
      router.push(`/chats/${created.chat.id}`);
    } catch {
      setError(true);
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="openings-h" className="flex flex-col gap-3">
      <h2 id="openings-h" className="m-0 text-lg font-bold">
        How the story starts
      </h2>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="sr-only">Pick the first message</legend>
        {openings.map((opening, index) => (
          <label
            key={index}
            className="flex cursor-pointer gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 leading-[1.6] text-[#e4e4e7] has-[:checked]:outline has-[:checked]:outline-2 has-[:checked]:outline-accent"
          >
            <input
              type="radio"
              name="opening"
              className="mt-1.5 accent-[var(--color-accent)]"
              checked={chosen === index}
              onChange={() => setChosen(index)}
            />
            <span className="min-w-0 flex-1">
              <Markdown text={opening} />
            </span>
          </label>
        ))}
      </fieldset>
      {!isPending &&
        (me ? (
          <button type="button" className="pill pill-accent self-start" disabled={starting} onClick={start}>
            Start a new chat
          </button>
        ) : (
          <Link href="/login" className="pill pill-accent self-start">
            Log in to chat
          </Link>
        ))}
      {error && <p className="m-0 text-error">The chat did not start. Try again.</p>}
    </section>
  );
}
