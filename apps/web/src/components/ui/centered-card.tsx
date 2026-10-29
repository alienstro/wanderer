import Image from "next/image";
import type { ReactNode } from "react";

/**
 * A centered card with the logo, for the pages outside the app shell, as the v2 sign-in dialog:
 * a dark card with a thin line on the black ground.
 */
export function CenteredCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div className="relative flex w-full max-w-[400px] flex-col gap-5 rounded-[20px] border border-[#222228] bg-[#111114] px-7 pt-7 pb-6 shadow-[0_30px_80px_rgb(0_0_0/0.5)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.webp" alt="" width={56} height={56} className="logo-ring size-14" priority />
          <span className="wordmark text-[15px]">Wanderer</span>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[22px] leading-[1.2] font-extrabold tracking-[-0.01em]">{title}</h1>
            {subtitle ? <p className="m-0 text-[13.5px] text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
