"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { CharacterDetail, CharacterLikeState } from "@wanderer/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { HeartIcon } from "@/components/ui/heart-icon";
import { apiFetch } from "@/lib/api";
import { likesLabel } from "@/lib/format";
import { useMe } from "@/lib/query-provider";
import { characterQueryKey } from "./query-key";

const PILL = "pill pill-soft min-h-[38px] px-4 text-[13px]";

/**
 * The heart and the like count. A tap changes the heart at once and puts it back when the request fails.
 * A tap while a request runs does nothing, so the heart and the count always agree with the API.
 * A visitor gets a link to /login. The owner sees nothing, because a creator cannot like their own character, and the
 * Likes count above the buttons already shows the number.
 */
export function LikeButton({
  characterId,
  likeCount,
  likedByMe,
  isOwner,
}: {
  characterId: string;
  likeCount: number;
  likedByMe: boolean;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  // The local state wins over the props after a tap, because the page can still show the visitor version.
  const [local, setLocal] = useState<CharacterLikeState | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const shown = local ?? { likeCount, likedByMe };

  if (isOwner) {
    return null;
  }
  if (me === undefined) {
    // The same pill as the button, so the row of buttons does not move when the user loads.
    return (
      <span className={PILL}>
        <HeartIcon size={14} />
        {likesLabel(shown.likeCount)}
      </span>
    );
  }
  if (me === null) {
    return (
      <Link href="/login" className={PILL} aria-label={`Log in to like. ${likesLabel(shown.likeCount)}`}>
        <HeartIcon size={14} />
        {likesLabel(shown.likeCount)}
      </Link>
    );
  }

  async function toggle() {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    const before = shown;
    const liked = !before.likedByMe;
    setLocal({ likeCount: before.likeCount + (liked ? 1 : -1), likedByMe: liked });
    try {
      const state = await apiFetch<CharacterLikeState>(`/characters/${encodeURIComponent(characterId)}/like`, {
        method: liked ? "PUT" : "DELETE",
      });
      setLocal(state);
      queryClient.setQueryData<CharacterDetail>(characterQueryKey(characterId, me?.id ?? null), (old) =>
        old ? { ...old, ...state } : old,
      );
    } catch {
      setLocal(before);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`${PILL} ${shown.likedByMe ? "text-[#ff5c7a]" : ""}`}
      aria-pressed={shown.likedByMe}
      aria-busy={busy}
      aria-label={`Like. ${likesLabel(shown.likeCount)}`}
      onClick={toggle}
    >
      <HeartIcon size={14} filled={shown.likedByMe} />
      <span className="text-text">{likesLabel(shown.likeCount)}</span>
    </button>
  );
}
