import Image from "next/image";
import type { ReactNode } from "react";

/**
 * A centered card with the large logo, for the pages outside the app shell.
 * The page has the dot grid and the violet glow of the closing section of the landing page.
 */
export function CenteredCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="dot-grid relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_50%_at_50%_35%,rgb(99_46_255/0.24),transparent_70%)]"
      />
      <div className="relative flex w-full max-w-[420px] flex-col gap-6 rounded-[28px] border border-line bg-sidebar/90 p-8 shadow-[0_30px_80px_rgb(0_0_0/0.5)] backdrop-blur-md">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image src="/logo.webp" alt="" width={72} height={72} className="logo-ring size-[72px]" priority />
          <span className="wordmark text-[24px]">Wanderer</span>
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[28px] leading-[1.1] font-medium tracking-[-0.03em]">{title}</h1>
            {subtitle ? <p className="m-0 text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
