"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChatListResponse } from "@wanderer/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

/**
 * The newest chat of each character, newest first. The Recent list and the "Continue" banner use it.
 * The key starts with "chats", so an invalidation of ["chats"] loads it again.
 */
export function useRecentChats() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["chats", "latestPerCharacter"],
    queryFn: () => apiFetch<ChatListResponse>("/chats?latestPerCharacter=true"),
    enabled: Boolean(me),
  });
}
