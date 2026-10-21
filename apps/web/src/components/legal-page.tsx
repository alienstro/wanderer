import Link from "next/link";
import type { ReactNode } from "react";

/** The layout of the Terms and Privacy pages. The "Draft" label stays until a legal check. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-12">
      <Link href="/login" className="text-[13px]">
        ← Back to login
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{title}</h1>
        <span className="rounded-full bg-[#3a2a12] px-2.5 py-0.5 text-[12px] font-semibold text-gold">Draft</span>
      </div>
      <p className="m-0 text-subtle">Version {updated}. A person with legal knowledge must check this text.</p>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-[#d4d4d8] [&_h2]:m-0 [&_h2]:mt-2 [&_h2]:text-[17px] [&_h2]:text-text [&_ul]:m-0 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
