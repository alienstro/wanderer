"use client";

import { toast } from "sonner";

/**
 * A round Share button. `small` is the size of the chat intro. It opens the share sheet of the device when the browser has one, as most phones do.
 * Other browsers copy the link and show "Link copied". A user who closes the share sheet sees nothing.
 */
export function ShareButton({ title, path, small = false }: { title: string; path: string; small?: boolean }) {
  async function share() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast.error("The link did not copy. Copy it from the address bar.");
    }
  }

  return (
    <button
      type="button"
      aria-label="Share this character"
      onClick={() => void share()}
      className={`grid cursor-pointer place-items-center rounded-full border-0 bg-surface-2 text-[#e4e4e7] hover:bg-[#26262b] ${small ? "size-[34px]" : "size-[38px]"}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
      </svg>
    </button>
  );
}
