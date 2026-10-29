"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharacterDetail } from "@wanderer/shared";
import { useParams, useRouter } from "next/navigation";
import { CharacterForm } from "@/features/characters/form/character-form";
import { apiFetch } from "@/lib/api";
import { useRequireLogin } from "@/lib/use-require-login";

export function EditCharacterView() {
  const { id } = useParams<{ id: string }>();
  const me = useRequireLogin();
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["character", id, me?.id ?? null],
    queryFn: () => apiFetch<CharacterDetail>(`/characters/${encodeURIComponent(id)}`),
    enabled: me !== undefined,
  });

  if (!me || query.isPending) {
    return null;
  }
  if (!query.data?.isOwner) {
    return (
      <div className="flex flex-col gap-2 px-7 pt-7 pb-20 max-[760px]:px-4">
        <h1 className="m-0 text-2xl font-bold">Not found</h1>
        <p className="m-0 text-muted">This character does not exist or is not yours.</p>
      </div>
    );
  }
  return (
    <div className="px-8 pt-6 pb-14 max-[760px]:px-4">
      <CharacterForm
        header={<h1 className="m-0 text-2xl font-extrabold tracking-[-0.01em]">Edit {query.data.title}</h1>}
        creatorHandle={me.handle ?? "you"}
        key={query.data.id}
        initial={query.data}
        onSaved={(detail) => {
          queryClient.setQueryData(["character", id, me.id], detail);
          void queryClient.invalidateQueries({ queryKey: ["characters"] });
          router.push(`/characters/${detail.id}`);
        }}
      />
    </div>
  );
}
