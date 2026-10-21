"use client";

import { useQuery } from "@tanstack/react-query";
import type { MyCharacterCard } from "@wanderer/shared";
import Link from "next/link";
import { CharacterCard } from "@/components/character-card";
import { apiFetch } from "@/lib/api";
import { statusLabel } from "@/lib/format";
import { useRequireLogin } from "@/lib/use-require-login";

/** All characters of the user, drafts and private ones too, newest first. */
export default function MyCharactersPage() {
  const me = useRequireLogin();
  const list = useQuery({
    // The key starts with "characters", so a save or a delete loads this list again.
    queryKey: ["characters", "mine", me?.id ?? null],
    queryFn: () => apiFetch<MyCharacterCard[]>("/me/characters"),
    enabled: me !== undefined,
  });

  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">My characters</h1>
        <Link href="/create" className="pill pill-accent">
          Create a character
        </Link>
      </div>
      {list.isError && <p className="m-0 text-error">Your characters did not load. Reload the page.</p>}
      {list.data && list.data.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 rounded-[18px] bg-surface px-6 py-14 text-center">
          <p className="m-0 text-[17px] font-semibold">You have no characters yet.</p>
          <p className="m-0 text-muted">Make one, or import a Tavern PNG card.</p>
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-[18px] gap-y-7 p-0">
          {list.data.map((card) => (
            <li key={card.id} className="flex">
              <CharacterCard card={card} extraBadge={statusLabel(card)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
