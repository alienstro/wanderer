import Image from "next/image";
import type { ReactNode } from "react";

/** A centered card with the large logo, for the pages outside the app shell. */
export function CenteredCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-[20px] border border-line bg-surface p-7">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image src="/logo.webp" alt="" width={72} height={72} className="logo-ring size-[72px]" priority />
          <span className="wordmark text-[24px]">Wanderer</span>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
            {subtitle ? <p className="m-0 text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
