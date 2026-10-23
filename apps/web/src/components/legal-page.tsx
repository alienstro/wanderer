import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const LEGAL_PAGES = [
  { href: "/terms", title: "Terms of Service" },
  { href: "/privacy", title: "Privacy Policy" },
] as const;

type LegalHref = (typeof LEGAL_PAGES)[number]["href"];

/** Writes a version such as "2026-10-21" as "21 October 2026". */
function formatVersion(version: string): string {
  return new Date(`${version}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A list in a legal section. The "cross" marker is for things that are not allowed. */
export function LegalList({ items, marker = "dot" }: { items: readonly string[]; marker?: "dot" | "cross" }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          {marker === "cross" ? (
            <svg
              viewBox="0 0 24 24"
              className="mt-[3px] size-[18px] flex-none text-error"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M5.6 5.6l12.8 12.8" />
            </svg>
          ) : (
            <span className="mt-[9px] size-1.5 flex-none rounded-full bg-accent-hover" aria-hidden />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The layout of the Terms and Privacy pages: a header with a switch between the two, and the sections. */
export function LegalPage({
  current,
  lead,
  updated,
  sections,
}: {
  current: LegalHref;
  lead: string;
  updated: string;
  sections: readonly LegalSection[];
}) {
  const title = LEGAL_PAGES.find((page) => page.href === current)?.title;
  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden border-b border-line">
        {/* The violet glow comes from the sky of the logo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_15%_-20%,rgb(99_46_255/0.24),transparent_65%)]"
        />
        <div className="relative mx-auto flex max-w-[1080px] flex-col gap-12 px-4 pb-12 pt-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2.5">
              <Image src="/logo.webp" alt="" width={32} height={32} className="logo-ring size-8 flex-none" priority />
              <span className="wordmark">Wanderer</span>
            </span>
            <Link href="/login" className="pill pill-ghost pill-sm">
              Back to login
            </Link>
          </div>
          <div className="flex flex-col gap-5">
            <nav
              aria-label="Legal pages"
              className="flex self-start rounded-full border border-line bg-surface/80 p-1 backdrop-blur"
            >
              {LEGAL_PAGES.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  aria-current={page.href === current ? "page" : undefined}
                  className="pill pill-sm text-muted hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:text-text"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
            <h1 className="m-0 text-[clamp(34px,6vw,52px)] font-bold leading-[1.04] tracking-[-0.035em]">{title}</h1>
            <p className="m-0 max-w-[56ch] text-[17px] leading-relaxed text-muted">{lead}</p>
            <p className="m-0 text-[13px] text-subtle">
              Updated <time dateTime={updated}>{formatVersion(updated)}</time>
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1080px] gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8 flex flex-col border-l border-line">
            <p className="m-0 mb-2 pl-4 text-[13px] font-semibold text-text">On this page</p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="-ml-px border-l border-transparent py-1.5 pl-4 text-[13px] text-muted no-underline hover:border-accent-hover hover:text-text"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>
        <div className="flex max-w-[64ch] flex-col">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-8 border-t border-line py-8 first:border-t-0 first:pt-0"
            >
              <h2 id={`${section.id}-title`} className="m-0 mb-3.5 text-[20px] font-semibold tracking-[-0.015em]">
                {section.title}
              </h2>
              <div className="flex flex-col gap-3 text-[15px] leading-[1.7] text-[#d4d4d8] [&_p]:m-0">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
