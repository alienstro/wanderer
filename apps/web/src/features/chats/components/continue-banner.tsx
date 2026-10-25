"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChatListResponse } from "@wanderer/shared";
import Link from "next/link";
import { apiFetch, fileSrc } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { Avatar } from "@/components/ui/avatar";

/** "Continue your chat": the latest chat of the user, with its last line. Nothing shows with no chats. */
export function ContinueBanner() {
  const { data: me } = useMe();
  const chats = useQuery({
    // The same query as the Recent list in the sidebar.
    queryKey: ["chats"],
    queryFn: () => apiFetch<ChatListResponse>("/chats"),
    enabled: Boolean(me),
  });
  const latest = chats.data?.items[0];
  if (!me || !latest) {
    return null;
  }
  return (
    <Link href={`/chats/${latest.id}`} className="flex items-center gap-4 panel px-5 py-4 hover:bg-hover">
      <Avatar name={latest.title} src={latest.character.avatarUrl ? fileSrc(latest.character.avatarUrl) : null} size={52} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-muted">Continue your chat</span>
        <span className="font-semibold">{latest.title}</span>
        <span className="max-w-[64ch] truncate text-[#c4c4cc]">{latest.lastMessage}</span>
      </span>
    </Link>
  );
}
