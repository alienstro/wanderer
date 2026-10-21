import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { HandleRedirect } from "@/components/handle-redirect";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <HandleRedirect />
      {children}
    </AppShell>
  );
}
