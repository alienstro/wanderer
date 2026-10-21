"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "./query-provider";

/** Sends a visitor to /login. It gives the user, or undefined while the check runs. */
export function useRequireLogin() {
  const router = useRouter();
  const { data: me } = useMe();

  useEffect(() => {
    if (me === null) {
      router.replace("/login");
    }
  }, [me, router]);

  return me ?? undefined;
}
