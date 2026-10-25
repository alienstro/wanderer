"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CharacterForm } from "@/features/characters/form/character-form";
import { useRequireLogin } from "@/lib/use-require-login";

export function CreateCharacterView() {
  const me = useRequireLogin();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (!me) {
    return null;
  }
  return (
    <div className="flex flex-col gap-[22px] px-7 pt-7 pb-20 max-[760px]:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Create a character</h1>
        <p className="m-0 text-muted">Set up how your character looks, speaks, and behaves in chat.</p>
      </div>
      <CharacterForm
        creatorHandle={me.handle ?? "you"}
        onSaved={(detail) => {
          void queryClient.invalidateQueries({ queryKey: ["characters"] });
          router.push(`/characters/${detail.id}`);
        }}
      />
    </div>
  );
}
