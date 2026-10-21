"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharacterDetail } from "@wanderer/shared";
import type { ReactNode } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { AdultWarning } from "./adult-warning";
import { CharacterView } from "./character-view";
import { OwnerPanel } from "./owner-panel";

export type CharacterError = "not_found" | "adult_content";

function errorOf(error: unknown): CharacterError {
  return error instanceof ApiError && error.code === "adult_content" ? "adult_content" : "not_found";
}

/**
 * The server gives the visitor version in `initial`, or the visitor error. A logged-in user gets the character
 * again with the session, because the owner sees a private character and a user can see an 18+ character.
 */
export function CharacterPage({
  id,
  initial,
  initialError,
}: {
  id: string;
  initial: CharacterDetail | null;
  initialError: CharacterError | null;
}) {
  const queryClient = useQueryClient();
  const { data: me, isPending: mePending } = useMe();
  const viewer = me?.id ?? null;
  const queryKey = ["character", id, viewer];
  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch<CharacterDetail>(`/characters/${encodeURIComponent(id)}`),
    enabled: viewer !== null,
  });

  if (mePending) {
    return initial ? <Layout detail={initial} /> : null;
  }

  const detail = viewer ? (query.data ?? (query.isPending ? initial : null)) : initial;
  const error = viewer ? (query.isError ? errorOf(query.error) : null) : initialError;

  if (detail) {
    return (
      <Layout detail={detail}>
        {detail.isOwner && <OwnerPanel detail={detail} onSaved={(saved) => queryClient.setQueryData(queryKey, saved)} />}
      </Layout>
    );
  }
  if (error === "adult_content") {
    return (
      <div className="px-7 pt-7 pb-20 max-[760px]:px-4">
        <AdultWarning onConfirmed={() => void query.refetch()} />
      </div>
    );
  }
  if (error === "not_found") {
    return (
      <div className="flex flex-col gap-2 px-7 pt-7 pb-20 max-[760px]:px-4">
        <h1 className="m-0 text-2xl font-bold">Not found</h1>
        <p className="m-0 text-muted">This character does not exist or is private.</p>
      </div>
    );
  }
  return null;
}

function Layout({ detail, children }: { detail: CharacterDetail; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-7 px-7 pt-7 pb-20 max-[760px]:px-4">
      <CharacterView detail={detail} />
      {children}
    </div>
  );
}
