"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { type CharacterListResponse, TAGS, type TagSlug } from "@wanderer/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CharacterCard } from "@/components/character-card";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

export type DiscoverSort = "most_chats" | "newest";

interface DiscoverQuery {
  q: string;
  tag: TagSlug | null;
  sort: DiscoverSort;
}

const SEARCH_PAUSE_MS = 300;

/** The query string of the Discover URL. It leaves out the default values. */
function discoverParams({ q, tag, sort }: DiscoverQuery, cursor: string | null = null): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (sort !== "most_chats") params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  return params;
}

function discoverHref(pathname: string, query: DiscoverQuery): string {
  const params = discoverParams(query).toString();
  return params ? `${pathname}?${params}` : pathname;
}

/**
 * The Discover page. The server renders the visitor list into `initial`. In the browser, a logged-in user
 * gets the list again with the session, because the 18+ setting can change it.
 */
export function DiscoverView({ initial, q, tag, sort }: DiscoverQuery & { initial: CharacterListResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isPending: mePending } = useMe();
  const viewer = me?.id ?? null;
  const [text, setText] = useState(q);

  function go(next: DiscoverQuery) {
    router.replace(discoverHref(pathname, next), { scroll: false });
  }

  // The search starts after a pause in the typing, so each key does not load a new page.
  useEffect(() => {
    const wanted = text.trim();
    if (wanted === q) {
      return;
    }
    const timer = setTimeout(() => router.replace(discoverHref(pathname, { q: wanted, tag, sort }), { scroll: false }), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, q, tag, sort, router, pathname]);

  const list = useInfiniteQuery({
    queryKey: ["characters", q, tag, sort, viewer],
    queryFn: ({ pageParam }) =>
      apiFetch<CharacterListResponse>(`/characters?${discoverParams({ q, tag, sort }, pageParam).toString()}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // The server list is the visitor list, so only a visitor can use it as the first page.
    initialData: viewer ? undefined : { pages: [initial], pageParams: [null] },
    staleTime: 30_000,
    enabled: !mePending,
  });
  const pages = list.data?.pages ?? [initial];
  const items = pages.flatMap((page) => page.items);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-2 px-7 py-3.5 max-[760px]:px-4">
        <label className="flex h-10 flex-[0_1_340px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-subtle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Search characters</span>
          <input
            type="search"
            value={text}
            maxLength={100}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-auto border-0 bg-transparent text-text outline-none"
          />
        </label>
      </div>

      <div className="flex flex-col gap-9 px-7 pb-20 max-[760px]:px-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] text-muted">{me ? `Welcome back, ${me.name}` : "Welcome to Wanderer"}</span>
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Discover</h1>
        </div>

        <section aria-labelledby="grid-h" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="grid-h" className="m-0 text-lg font-bold">
              Characters
            </h2>
            <div role="group" aria-label="Sort by" className="flex gap-1 rounded-full bg-surface p-1">
              <button type="button" className="seg" aria-pressed={sort === "most_chats"} onClick={() => go({ q, tag, sort: "most_chats" })}>
                Most chats
              </button>
              <button type="button" className="seg" aria-pressed={sort === "newest"} onClick={() => go({ q, tag, sort: "newest" })}>
                Newest
              </button>
            </div>
          </div>

          <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2">
            <button type="button" className="chip" aria-pressed={tag === null} onClick={() => go({ q, tag: null, sort })}>
              All
            </button>
            {TAGS.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="chip"
                aria-pressed={tag === item.slug}
                onClick={() => go({ q, tag: tag === item.slug ? null : item.slug, sort })}
              >
                {item.label}
              </button>
            ))}
          </div>

          {items.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-[18px] gap-y-7 p-0">
              {items.map((card) => (
                <li key={card.id} className="flex">
                  <CharacterCard card={card} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-[18px] bg-surface px-6 py-14 text-center">
              <p className="m-0 text-[17px] font-semibold">No characters match your search.</p>
              <p className="m-0 text-muted">Try a different word, or make the character yourself.</p>
              <Link href="/create" className="pill pill-accent">
                Create a character
              </Link>
            </div>
          )}

          {list.hasNextPage && (
            <button
              type="button"
              className="pill pill-soft self-center"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
