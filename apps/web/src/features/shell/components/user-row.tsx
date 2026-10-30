"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { Avatar } from "@/components/ui/avatar";

/** The foot of the sidebar: the user row with the account menu, or a white "Log in" pill and the 18+ note for a visitor. The rail shows only the avatar. */
export function UserRow() {
  const { data: me, isPending } = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (isPending) {
    return null;
  }
  if (!me) {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <Link href="/login" className="pill pill-light relative min-h-11 w-full rail:w-10 rail:self-center rail:px-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
          </svg>
          <span className="side-label">Log in</span>
        </Link>
        <span className="text-xs text-subtle rail:hidden">
          18+ only.{" "}
          <Link href="/terms" className="text-muted">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-muted">
            Privacy
          </Link>
        </span>
      </div>
    );
  }

  async function logOut() {
    setOpen(false);
    await apiFetch("/auth/logout", { method: "POST" });
    queryClient.setQueryData(["me"], null);
    router.replace("/login");
  }

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        // The menu takes the Escape key, so the phone drawer around it stays open.
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2 py-1.5 text-left text-text transition-colors hover:bg-hover active:bg-(--color-current) rail:p-1"
      >
        <Avatar name={me.name} src={me.pictureUrl} size={32} />
        <span className="flex min-w-0 flex-col rail:hidden">
          <span className="truncate text-sm font-semibold">{me.name}</span>
          {me.handle && <span className="truncate text-xs text-subtle">@{me.handle}</span>}
        </span>
      </button>
      {/* The menu stays on the page, so that it can fade out. `hidden` takes it out of the focus order.
          The menu is as wide as the row, because the open sidebar cuts off what goes past its edge. The rail does not. */}
      <div
        role="menu"
        aria-label="Account"
        hidden={!open}
        className="menu-pop absolute right-0 bottom-12 left-0 z-20 flex origin-bottom-left rail:right-auto rail:w-[220px] flex-col rounded-[14px] border border-field-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      >
        <Link role="menuitem" href="/my-characters" className="nav" onClick={() => setOpen(false)}>
          My characters
        </Link>
        <Link role="menuitem" href="/settings" className="nav" onClick={() => setOpen(false)}>
          Settings
        </Link>
        {me.role === "admin" && (
          <Link role="menuitem" href="/admin" className="nav" onClick={() => setOpen(false)}>
            Admin
          </Link>
        )}
        <button type="button" role="menuitem" className="nav" onClick={() => void logOut()}>
          Log out
        </button>
      </div>
    </div>
  );
}
