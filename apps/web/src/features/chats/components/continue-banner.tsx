"use client";

import Link from "next/link";
import { fileSrc } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { Avatar } from "@/components/ui/avatar";
import { useRecentChats } from "../recent-chats-query";

/** "Continue your chat": the latest chat of the user, with its last line. Nothing shows with no chats. */
export function ContinueBanner() {
  const { data: me } = useMe();
  // The same query as the Recent list in the sidebar. Its first chat is the latest chat of the user.
  const chats = useRecentChats();
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
