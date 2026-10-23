"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/lib/query-provider";

/**
 * Sends a logged-in user from the landing page to Discover. The server does this when the signed-in hint is set.
 * This check is for a browser that has a session but no hint yet.
 */
export function SessionRedirect() {
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (me) {
      router.replace("/discover");
    }
  }, [me, router]);

  return null;
}
