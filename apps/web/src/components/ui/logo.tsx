import Image from "next/image";
import Link from "next/link";

/** The round logo with the gold ring, and the WANDERER name. `compact` is the small size of the sidebar. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`flex items-center text-text no-underline rail:px-1 ${compact ? "gap-[9px] px-1.5" : "gap-2.5 px-2.5 py-0.5"}`}>
      <Image
        src="/logo.webp"
        alt=""
        width={compact ? 26 : 32}
        height={compact ? 26 : 32}
        className={`logo-ring flex-none ${compact ? "size-[26px]" : "size-8"}`}
        priority
      />
      <span className={`wordmark rail:sr-only ${compact ? "text-[14px] tracking-[0.12em]" : ""}`}>Wanderer</span>
    </Link>
  );
}
