"use client";

import { useSyncExternalStore } from "react";

/**
 * True when the media query matches, and false on the server and in a browser without matchMedia.
 * useSyncExternalStore reads the value again when the window crosses the query, with no hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
