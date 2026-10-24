"use client";

import type { ChatDetail } from "@wanderer/shared";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

interface OpeningSwitcherProps {
  chatId: string;
  index: number;
  count: number;
  onChanged: (detail: ChatDetail) => void;
  /** The chat got a user message in another tab, so the opening cannot change now. */
  onLocked: () => void;
}

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/** The `<` and `>` arrows and the "1 / N" counter under the opening, before the first user message. */
export function OpeningSwitcher({ chatId, index, count, onChanged, onLocked }: OpeningSwitcherProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function pick(openingIndex: number) {
    setPending(true);
    setError(false);
    try {
      onChanged(
        await apiFetch<ChatDetail>(`/chats/${chatId}/opening`, {
          method: "PATCH",
          body: JSON.stringify({ openingIndex }),
        }),
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "opening_locked") {
        onLocked();
      } else {
        setError(true);
      }
    } finally {
      setPending(false);
    }
  }

  const arrowClass = "grid size-10 place-items-center rounded-full text-text hover:bg-surface disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
        {index > 0 ? (
          <button type="button" className={arrowClass} aria-label="Previous opening" disabled={pending} onClick={() => void pick(index - 1)}>
            <Arrow direction="left" />
          </button>
        ) : (
          <span />
        )}
        <span className="text-center text-sm text-muted" aria-live="polite">
          {index + 1} / {count}
        </span>
        {index < count - 1 ? (
          <button type="button" className={arrowClass} aria-label="Next opening" disabled={pending} onClick={() => void pick(index + 1)}>
            <Arrow direction="right" />
          </button>
        ) : (
          <span />
        )}
      </div>
      {error && <p className="m-0 text-center text-sm text-error">The opening did not change. Try again.</p>}
    </div>
  );
}
