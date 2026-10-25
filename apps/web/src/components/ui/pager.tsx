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

/** A list with this number of pages or less shows each page number. */
const ALL_PAGES_MAX = 7;

/**
 * The page numbers to show: each page of a short list, else the first page, the pages next to the current one, and
 * the last page. A "gap" stands for the pages that do not show.
 */
export function pageNumbers(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= ALL_PAGES_MAX) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  // Near an end, the window has 5 pages, so the list always has 7 places.
  const start = page <= 4 ? 2 : page >= pageCount - 3 ? pageCount - 4 : page - 1;
  const end = page <= 4 ? 5 : page >= pageCount - 3 ? pageCount - 1 : page + 1;
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [1, ...(start > 2 ? (["gap"] as const) : []), ...middle, ...(end < pageCount - 1 ? (["gap"] as const) : []), pageCount];
}

const STEP_BUTTON = "pill pill-soft pill-sm max-[760px]:min-w-8 max-[760px]:px-0 max-[760px]:justify-center";

interface NumberedPagerProps {
  /** The name of the navigation, such as "User pages". */
  label: string;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

/** Previous, the page numbers and Next, for a list that knows its page count. It shows nothing for one page. */
export function NumberedPager({ label, page, pageCount, onPage }: NumberedPagerProps) {
  if (pageCount <= 1) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5 max-[760px]:gap-1">
      {/* On a phone, the arrows and the smaller buttons keep the pager on one line. */}
      <button type="button" className={STEP_BUTTON} aria-label="Previous" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <span className="max-[760px]:hidden">Previous</span>
        <span aria-hidden="true" className="min-[761px]:hidden">‹</span>
      </button>
      {pageNumbers(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className="chip min-w-9 justify-center tabular-nums max-[760px]:min-w-8 max-[760px]:px-0"
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPage(item)}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className={STEP_BUTTON} aria-label="Next" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        <span className="max-[760px]:hidden">Next</span>
        <span aria-hidden="true" className="min-[761px]:hidden">›</span>
      </button>
    </nav>
  );
}
