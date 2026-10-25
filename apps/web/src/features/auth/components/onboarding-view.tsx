"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@wanderer/shared";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CenteredCard } from "@/components/ui/centered-card";
import { useMe } from "@/lib/query-provider";
import { HandleForm } from "./handle-form";

/** The handle step after the first login. A user without a session goes to /login, and a user with a handle goes to /discover. */
export function OnboardingView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isPending, isError } = useMe();

  useEffect(() => {
    if (me === null) {
      router.replace("/login");
    } else if (me?.handle) {
      router.replace("/discover");
    }
  }, [me, router]);

  if (isError) {
    return <CenteredCard title="Something went wrong" subtitle="Wanderer could not load your account. Reload the page." />;
  }
  if (isPending || !me || me.handle) {
    return null;
  }

  function done(updated: MeResponse) {
    queryClient.setQueryData(["me"], updated);
    router.replace("/discover");
  }

  return (
    <CenteredCard title="Pick your handle" subtitle={`Welcome, ${me.name}.`}>
      <HandleForm suggested={me.suggestedHandle ?? ""} onDone={done} />
    </CenteredCard>
  );
}
