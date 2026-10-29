import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { ModelCard } from "./model-card";
import { RecentChats } from "./recent-chats";
import { SidebarDrawer } from "./sidebar-drawer";
import { SidebarNav } from "./sidebar-nav";
import { UserRow } from "./user-row";

/**
 * The sidebar (links, Recent chats, the model card, and the user row) and the main area.
 * The sidebar is a black column with the full height of the window, as in the v2 design.
 * On a phone a thin top bar opens the sidebar as a drawer, so each page starts with its own content.
 * The backdrop is on the shell, not on main, so it also shows behind and around the sidebar and the rail.
 */
export function AppShell({ children, defaultRail }: { children: ReactNode; defaultRail: boolean }) {
  return (
    <div className="app-backdrop flex min-h-dvh max-[760px]:flex-col">
      <SidebarDrawer defaultRail={defaultRail}>
        <Logo compact />
        <SidebarNav />
        <RecentChats />
        <div className="side-foot">
          <ModelCard />
          <UserRow />
        </div>
      </SidebarDrawer>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
