"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const NAV_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "Discover",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2 5-5 2 2-5z" />
      </svg>
    ),
  },
  {
    href: "/my-characters",
    label: "My characters",
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.8-1.6-4.8-4-5.6" />
      </svg>
    ),
  },
];

/** The Create pill and the main links of the sidebar. Plan 3 adds For you. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <>
      <Link href="/create" className="pill pill-soft justify-start px-3.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create
      </Link>
      <nav className="side-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="nav" aria-current={pathname === item.href ? "page" : undefined}>
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
