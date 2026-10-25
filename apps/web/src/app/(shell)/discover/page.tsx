import { type CharacterListResponse, characterListQuerySchema } from "@wanderer/shared";
import { serverApiFetch } from "@/lib/server-api";
import { DiscoverView } from "@/features/discover";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Discover. The server renders the visitor list, so the first page shows cards before the browser code runs. */
export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = characterListQuerySchema.safeParse({ q: first(raw.q), tag: first(raw.tag), sort: first(raw.sort) });
  // A bad value in the URL gives the default list, not an error page.
  const query = parsed.success ? parsed.data : characterListQuerySchema.parse({});
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.tag) params.set("tag", query.tag);
  params.set("sort", query.sort);
  const initial = await serverApiFetch<CharacterListResponse>(`/characters?${params.toString()}`);

  return <DiscoverView initial={initial} q={query.q ?? ""} tag={query.tag ?? null} sort={query.sort} />;
}
