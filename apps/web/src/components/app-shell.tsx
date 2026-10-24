import type { ReactNode } from "react";
import { Logo } from "./logo";
import { ModelCard } from "./model-card";
import { RecentChats } from "./recent-chats";
import { SidebarDrawer } from "./sidebar-drawer";
import { SidebarNav } from "./sidebar-nav";
import { UserRow } from "./user-row";

/**
 * The sidebar (links, Recent chats, the model card, and the user row) and the main area.
 * The sidebar floats with round corners, as the header bar of the landing page.
 * On a phone a thin top bar opens the sidebar as a drawer, so each page starts with its own content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh max-[760px]:flex-col">
      <SidebarDrawer>
        <Logo />
        <SidebarNav />
        <RecentChats />
        <div className="side-foot">
          <ModelCard />
          <UserRow />
        </div>
      </SidebarDrawer>
      <main className="app-backdrop min-w-0 flex-1">{children}</main>
    </div>
  );
}
