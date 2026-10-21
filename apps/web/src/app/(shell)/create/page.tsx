"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CharacterForm } from "@/components/character-form/character-form";
import { useRequireLogin } from "@/lib/use-require-login";

export default function CreatePage() {
  const me = useRequireLogin();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (!me) {
    return null;
  }
  return (
    <div className="flex flex-col gap-[22px] px-7 pt-7 pb-20 max-[760px]:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">Create a character</h1>
        <p className="m-0 text-muted">Set up how your character looks, speaks, and behaves in chat.</p>
      </div>
      <CharacterForm
        onSaved={(detail) => {
          void queryClient.invalidateQueries({ queryKey: ["characters"] });
          router.push(`/characters/${detail.id}`);
        }}
      />
    </div>
  );
}
