import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { HandleRedirect } from "@/features/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-rail";

/** The server reads the saved sidebar state, so the first paint shows the correct width with no jump. */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const defaultRail = (await cookies()).get(SIDEBAR_COOKIE)?.value === "rail";
  return (
    <AppShell defaultRail={defaultRail}>
      <HandleRedirect />
      {children}
    </AppShell>
  );
}
