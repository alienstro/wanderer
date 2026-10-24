"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_PAGES = [
  { href: "/admin", label: "Reports" },
  { href: "/admin/overview", label: "Overview" },
];

/** The links between the admin pages. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin pages" className="flex flex-wrap gap-2">
      {ADMIN_PAGES.map(({ href, label }) => (
        <Link key={href} href={href} className="chip" aria-current={pathname === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
