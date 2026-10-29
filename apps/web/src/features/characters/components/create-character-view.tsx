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
    <div className="px-8 pt-6 pb-14 max-[760px]:px-4">
      <CharacterForm
        header={
          <>
            <h1 className="m-0 text-2xl font-extrabold tracking-[-0.01em]">Create a character</h1>
            <p className="m-0 text-subtle">The card above is what people see on Discover.</p>
          </>
        }
        creatorHandle={me.handle ?? "you"}
        onSaved={(detail) => {
          void queryClient.invalidateQueries({ queryKey: ["characters"] });
          router.push(`/characters/${detail.id}`);
        }}
      />
    </div>
  );
}
