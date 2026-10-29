"use client";

import type { CharacterCard } from "@wanderer/shared";
import Link from "next/link";
import { useState } from "react";
import { useStartChat } from "@/features/characters";
import { fileSrc } from "@/lib/api";
import { chatsLabel } from "@/lib/format";
import { useMe } from "@/lib/query-provider";

const SLIDES = 5;
const WALL_COLUMNS = 6;

/** "Start a chat" for a user, and "Log in to chat" for a visitor. */
function StartButton({ characterId }: { characterId: string }) {
  const { data: me } = useMe();
  const { start, starting, error } = useStartChat(characterId);
  if (!me) {
    return (
      <Link href="/login" className="pill pill-light pill-sm">
        Log in to chat
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="pill pill-light pill-sm" disabled={starting} onClick={() => void start()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        Start a chat
      </button>
      {error && <p className="m-0 basis-full text-error">The chat did not start. Try again.</p>}
    </>
  );
}

/**
 * The featured banner at the top of Discover: the first 5 characters of the list, one at a time, with a wall of
 * character images on the right. The dots under the banner pick the character. Nothing shows for an empty list.
 */
export function FeaturedBanner({ items }: { items: CharacterCard[] }) {
  const [slide, setSlide] = useState(0);
  const slides = items.slice(0, SLIDES);
  if (slides.length === 0) {
    return null;
  }
  const current = slides[Math.min(slide, slides.length - 1)];
  const images = items.flatMap((item) => (item.avatarUrl ? [fileSrc(item.avatarUrl)] : []));
  const columns = images.length === 0 ? [] : Array.from({ length: WALL_COLUMNS }, (_, i) => [0, 3, 5].map((step) => images[(i + step) % images.length]));

  return (
    <section aria-label="Featured" className="flex flex-col items-center gap-3">
      <div className="relative h-60 w-full overflow-hidden rounded-[18px] bg-[#0d0d0f] max-[760px]:h-auto">
        <div aria-hidden="true" className="absolute -top-[30px] right-0 -bottom-[30px] grid w-[58%] grid-cols-6 gap-1.5 max-[760px]:w-full">
          {columns.map((column, i) => (
            <div key={i} className={`flex flex-col gap-1.5 ${i % 2 ? "-translate-y-12" : ""}`}>
              {column.map((src, j) => (
                <img key={j} src={src} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
              ))}
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#0d0d0f_0%,#0d0d0f_42%,rgba(13,13,15,0.4)_62%,rgba(13,13,15,0)_80%)] max-[760px]:bg-[rgba(13,13,15,0.82)]" />
        <div className="relative flex h-full max-w-[520px] flex-col justify-center gap-2.5 px-11 py-8 max-[760px]:px-5 max-[760px]:py-6">
          <h2 className="m-0 text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em] text-[#a9c8ff]">{current.title}</h2>
          <p className="m-0 text-[15px] text-[#e4e4e7]">
            {chatsLabel(current.chatCount)}, made by @{current.creatorHandle}
            {current.tags.length > 0 && ` · ${current.tags.map((tag) => tag.label).join(", ")}`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <StartButton key={current.id} characterId={current.id} />
            <Link href={`/characters/${current.id}`} className="pill pill-sm bg-white/15 text-white hover:bg-white/25">
              View character
            </Link>
          </div>
        </div>
      </div>
      {slides.length > 1 && (
        <div role="group" aria-label="Featured slides" className="flex gap-1.5">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Slide ${i + 1}: ${item.title}`}
              aria-pressed={i === slide}
              onClick={() => setSlide(i)}
              className={`tap-target h-1 rounded-sm border-0 p-0 ${i === slide ? "w-7 bg-white" : "w-3.5 bg-[#3a3a40]"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
