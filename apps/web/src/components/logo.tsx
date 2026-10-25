import Image from "next/image";
import Link from "next/link";

/** The round logo with the gold ring, and the WANDERER name. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2.5 py-0.5 text-text no-underline rail:px-1">
      <Image src="/logo.webp" alt="" width={32} height={32} className="logo-ring size-8 flex-none" priority />
      <span className="wordmark rail:sr-only">Wanderer</span>
    </Link>
  );
}
