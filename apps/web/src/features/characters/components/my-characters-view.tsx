"use client";

import { useQuery } from "@tanstack/react-query";
import type { MyCharacterCard } from "@wanderer/shared";
import Link from "next/link";
import { CharacterCard } from "@/features/characters/card/character-card";
import { apiFetch, fileSrc } from "@/lib/api";
import { compactCount, statusLabel } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { useRequireLogin } from "@/lib/use-require-login";

/** One count of the profile, such as "3 Characters". */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-base font-bold">{value}</span>
      <span className="text-[11px] text-subtle">{label}</span>
    </div>
  );
}

/**
 * All characters of the user, drafts and private ones too, newest first, in the v2 profile layout: a banner of up to 3
 * character images, the round avatar, the name, the counts, then the "Created" tab with the cards and a dashed Create card.
 */
export function MyCharactersView() {
  const me = useRequireLogin();
  const list = useQuery({
    // The key starts with "characters", so a save or a delete loads this list again.
    queryKey: ["characters", "mine", me?.id ?? null],
    queryFn: () => apiFetch<MyCharacterCard[]>("/me/characters"),
    enabled: me !== undefined,
  });
  const cards = list.data ?? [];
  const banner = cards.flatMap((card) => (card.avatarUrl ? [fileSrc(card.avatarUrl)] : [])).slice(0, 3);
  const sum = (pick: (card: MyCharacterCard) => number) => compactCount(cards.reduce((total, card) => total + pick(card), 0));

  return (
    <div className="px-8 pt-6 pb-14 max-[760px]:px-4">
      <div className="mx-auto flex w-full max-w-[980px] flex-col items-center">
        <section aria-label="Your profile" className="flex w-full flex-col items-center text-center">
          <div aria-hidden="true" className="grid h-[200px] w-full grid-cols-3 gap-0.5 overflow-hidden rounded-[18px] bg-surface max-[760px]:h-[140px]">
            {banner.map((src) => (
              <img key={src} src={src} alt="" className="size-full object-cover" />
            ))}
          </div>
          <span className="relative z-[1] -mt-12 rounded-full shadow-[0_0_0_4px_#000]">
            <Avatar name={me?.name ?? ""} src={me?.pictureUrl ?? null} size={96} />
          </span>
          <h1 className="m-0 mt-3 text-2xl leading-[1.2] font-extrabold tracking-[-0.01em]">My characters</h1>
          <span className="mt-0.5 text-xs text-subtle">
            {me?.name}
            {me?.handle && ` · @${me.handle}`}
          </span>
          <div className="mt-[18px] flex justify-center gap-7">
            <Stat value={compactCount(cards.length)} label="Characters" />
            <Stat value={sum((card) => card.chatCount)} label="Chats" />
            <Stat value={sum((card) => card.likeCount)} label="Likes" />
          </div>
          <div className="mt-[18px] flex justify-center gap-2">
            <Link href="/settings" className="pill pill-soft min-h-[38px] px-5">
              Settings
            </Link>
          </div>
        </section>

        <div role="tablist" aria-label="Your lists" className="mt-8 flex w-full justify-center border-b border-surface-2">
          <button type="button" role="tab" aria-selected="true" className="relative inline-flex h-11 items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-bold text-white">
            Created
            <span className="text-xs font-medium text-subtle">{cards.length}</span>
            <span aria-hidden="true" className="absolute bottom-1.5 left-1/2 -ml-[11px] h-[3px] w-[22px] -skew-x-[20deg] rounded-sm bg-accent" />
          </button>
        </div>

        <div role="tabpanel" aria-label="Created" className="flex w-full flex-col gap-3 pt-[18px]">
          {list.isError && <p className="m-0 text-center text-error">Your characters did not load. Reload the page.</p>}
          {list.data && list.data.length === 0 && (
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="m-0 text-[17px] font-semibold">You have no characters yet.</p>
              <p className="m-0 text-muted">Make one, or import a character card.</p>
            </div>
          )}
          {list.data && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,220px))] justify-center gap-3 max-[760px]:grid-cols-2">
              <ul className="contents">
                {list.data.map((card) => (
                  <li key={card.id} className="flex">
                    <CharacterCard card={card} statusBadge={statusLabel(card)} />
                  </li>
                ))}
              </ul>
              <Link
                href="/create"
                className="flex aspect-[3/4] flex-col items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[#33333a] text-muted no-underline hover:border-[#4a4a52]"
              >
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-accent text-black">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="font-semibold text-white">Create a character</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
