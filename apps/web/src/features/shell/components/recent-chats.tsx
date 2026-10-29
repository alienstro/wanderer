"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRecentChats } from "@/features/chats";
import { fileSrc } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { Avatar } from "@/components/ui/avatar";

const RECENT_COUNT = 8;

/**
 * The newest chat of each character in the sidebar, so a character shows one time.
 * A visitor and a user with no chats see nothing. The rail hides the list.
 */
export function RecentChats() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const chats = useRecentChats();
  const items = chats.data?.items.slice(0, RECENT_COUNT) ?? [];
  if (!me || items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="recent-h" className="flex flex-col gap-1 border-t border-line pt-3 rail:hidden">
      <h2 id="recent-h" className="m-0 px-3 pb-1 text-xs font-semibold text-subtle">
        Recent chats
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((chat) => {
          const href = `/chats/${chat.id}`;
          return (
            <li key={chat.id}>
              <Link href={href} className="nav min-h-[38px] rounded-[10px] px-2.5" aria-current={pathname === href ? "page" : undefined}>
                <Avatar name={chat.title} src={chat.character.avatarUrl ? fileSrc(chat.character.avatarUrl) : null} size={26} />
                <span className="truncate">{chat.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
