import type { CharacterDetail } from "@wanderer/shared";
import { ApiError } from "@/lib/api";
import { serverApiFetch } from "@/lib/server-api";
import { type CharacterError, CharacterPage } from "@/features/characters";

/** The character page. The server renders a public character for a visitor. The browser loads it again for a user. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initial: CharacterDetail | null = null;
  let initialError: CharacterError | null = null;
  try {
    initial = await serverApiFetch<CharacterDetail>(`/characters/${encodeURIComponent(id)}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
    initialError = "not_found";
  }
  return <CharacterPage id={id} initial={initial} initialError={initialError} />;
}
