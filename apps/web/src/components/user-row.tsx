"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";
import { Avatar } from "./avatar";

/** The foot of the sidebar: the user row with the account menu, or a "Log in" pill for a visitor. */
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
      <Link href="/login" className="pill pill-accent">
        Log in
      </Link>
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
        className="flex w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2 py-1.5 text-left text-text hover:bg-hover"
      >
        <Avatar name={me.name} src={me.pictureUrl} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{me.name}</span>
          {me.handle && <span className="truncate text-xs text-subtle">@{me.handle}</span>}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-12 left-0 z-20 flex w-[220px] flex-col rounded-[14px] border border-field-line bg-surface p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
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
      )}
    </div>
  );
}
