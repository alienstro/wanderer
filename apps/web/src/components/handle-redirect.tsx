"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/lib/query-provider";

/**
 * Sends a logged-in user without a handle to the handle step. It is in the shell layout,
 * so each page of the app gets the check. A visitor without a session stays, because
 * the public pages need no login.
 */
export function HandleRedirect() {
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (me && me.handle === null) {
      router.replace("/onboarding");
    }
  }, [me, router]);

  return null;
}
