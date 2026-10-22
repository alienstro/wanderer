import type { ReactNode } from "react";
import { Logo } from "./logo";
import { ModelCard } from "./model-card";
import { RecentChats } from "./recent-chats";
import { SidebarNav } from "./sidebar-nav";
import { UserRow } from "./user-row";

/** The sidebar (links, Recent chats, the model card, and the user row) and the main area. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap content-start">
      <aside className="sticky top-0 flex h-screen flex-[0_0_264px] flex-col gap-[18px] self-start overflow-y-auto border-r border-line bg-sidebar px-3 pt-[18px] pb-3.5 max-[760px]:static max-[760px]:h-auto max-[760px]:flex-[0_0_100%] max-[760px]:flex-row max-[760px]:flex-wrap max-[760px]:items-center max-[760px]:gap-x-3 max-[760px]:gap-y-2 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:px-4 max-[760px]:py-3">
        <Logo />
        <SidebarNav />
        <RecentChats />
        <div className="side-foot">
          <ModelCard />
          <UserRow />
        </div>
      </aside>
      {/* On a phone the sidebar fills the first row. A full basis moves the main area to the next row. */}
      <main className="min-w-0 flex-1 max-[760px]:basis-full">{children}</main>
    </div>
  );
}
