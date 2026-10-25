"use client";

import { useCallback, useState } from "react";

/**
 * The page of a list with a cursor. It keeps the cursors of the pages before, so Previous needs no request of its own.
 * Page 1 has no cursor.
 */
export function usePager() {
  const [cursors, setCursors] = useState<string[]>([]);
  // The functions stay the same between renders, so an effect can depend on them.
  const next = useCallback((cursor: string) => setCursors((current) => [...current, cursor]), []);
  const previous = useCallback(() => setCursors((current) => current.slice(0, -1)), []);
  const reset = useCallback(() => setCursors([]), []);
  return { cursor: cursors.at(-1), page: cursors.length + 1, next, previous, reset };
}

export type Pager = ReturnType<typeof usePager>;

interface PagerProps {
  /** The name of the navigation, such as "Recent problems pages". */
  label: string;
  pager: Pager;
  /** The cursor of the next page. Null on the last page, and undefined while the page loads. */
  nextCursor: string | null | undefined;
}

/** Previous, "Page N" and Next. It shows nothing when the list has only one page. */
export function Pager({ label, pager, nextCursor }: PagerProps) {
  if (pager.page === 1 && !nextCursor) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <button type="button" className="pill pill-soft pill-sm" disabled={pager.page === 1} onClick={pager.previous}>
        Previous
      </button>
      <span className="text-[13px] text-muted tabular-nums">Page {pager.page}</span>
      <button
        type="button"
        className="pill pill-soft pill-sm"
        disabled={!nextCursor}
        onClick={() => {
          if (nextCursor) {
            pager.next(nextCursor);
          }
        }}
      >
        Next
      </button>
    </nav>
  );
}
