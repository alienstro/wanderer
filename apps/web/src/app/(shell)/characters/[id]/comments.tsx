"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { COMMENT_MAX, type CharacterComment, type CommentListResponse } from "@wanderer/shared";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { ReportButton } from "@/components/report-dialog";
import { ApiError, apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

function postErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "You post too fast. Wait a minute and try again.";
  }
  if (error instanceof ApiError && error.code === "invalid_request") {
    return `The comment was not posted. It can have 1 to ${COMMENT_MAX.toLocaleString("en-US")} characters.`;
  }
  return "The comment was not posted. Try again.";
}

function CommentForm({ characterId, onPosted }: { characterId: string; onPosted: () => void }) {
  const boxId = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/characters/${encodeURIComponent(characterId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      onPosted();
    } catch (caught) {
      // The box keeps the text, so the user can change it and post again.
      setError(postErrorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => void post(event)}>
      <label htmlFor={boxId} className="label">
        Leave a comment or feedback for the creator
      </label>
      <textarea
        id={boxId}
        className="field"
        rows={3}
        maxLength={COMMENT_MAX}
        placeholder="Write something"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="hint">
          {body.length} / {COMMENT_MAX}
        </span>
        <button type="submit" className="pill pill-accent pill-sm" disabled={busy || body.trim() === ""}>
          Post comment
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
    </form>
  );
}

function CommentRow({ comment, signedIn, onDeleted }: { comment: CharacterComment; signedIn: boolean; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    try {
      await apiFetch(`/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" });
      onDeleted();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-semibold text-link">@{comment.authorHandle ?? "unknown"}</span>{" "}
          <span className="text-muted">
            {new Date(comment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </span>
        <div className="flex gap-2">
          {signedIn && !comment.isOwn && <ReportButton commentId={comment.id} className="pill pill-ghost pill-sm" />}
          {comment.canDelete && (
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      {/* React puts the body in as text, so a comment cannot add markup to the page. */}
      <p className="m-0 whitespace-pre-wrap text-[#e4e4e7] [overflow-wrap:anywhere]">{comment.body}</p>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Delete this comment">
          <span>Delete this comment? You cannot undo this.</span>
          <button type="button" className="pill pill-danger pill-sm" onClick={() => void remove()}>
            Yes, delete
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="m-0 text-error">The comment did not delete. Try again.</p>}
    </li>
  );
}

/**
 * The comments of the character page, newest first. A signed-in user can post. The next page loads when the
 * user scrolls to the end of the list, or clicks "Load more comments".
 */
export function CharacterComments({ characterId }: { characterId: string }) {
  const queryClient = useQueryClient();
  const { data: me, isPending: mePending } = useMe();
  const queryKey = ["comments", characterId];
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      apiFetch<CommentListResponse>(
        `/characters/${encodeURIComponent(characterId)}/comments${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const count = pages[0]?.count ?? 0;
  const reload = () => void queryClient.invalidateQueries({ queryKey });

  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const target = end.current;
    if (!target || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section aria-labelledby="comments-h" className="flex flex-col gap-3">
      <h2 id="comments-h" className="m-0 flex items-center gap-2 text-lg font-bold">
        Comments <span className="tag px-2.5 py-[3px] text-xs">{count}</span>
      </h2>
      {me ? (
        <CommentForm characterId={characterId} onPosted={reload} />
      ) : (
        !mePending && (
          <p className="m-0 text-muted">
            <Link href="/login" className="text-link">
              Log in
            </Link>{" "}
            to leave a comment or feedback for the creator.
          </p>
        )
      )}
      {list.isError ? (
        <p role="alert" className="m-0 text-error">
          The comments did not load. Reload the page to try again.
        </p>
      ) : (
        items.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {items.map((comment) => (
              <CommentRow key={comment.id} comment={comment} signedIn={Boolean(me)} onDeleted={reload} />
            ))}
          </ul>
        )
      )}
      {list.isSuccess && items.length === 0 && <p className="m-0 text-muted">No comments yet.</p>}
      {hasNextPage && (
        <div ref={end} className="flex justify-center">
          <button type="button" className="pill pill-soft" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            {isFetchingNextPage ? "Loading…" : "Load more comments"}
          </button>
        </div>
      )}
    </section>
  );
}
