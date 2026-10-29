import type { CharacterCard, CharacterListResponse } from "@wanderer/shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/server-api";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/signed-in-hint";
import { LANDING_DEFINITION, LandingView } from "@/features/landing";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "Wanderer: text roleplay with AI characters";
const HERO_COUNT = 10;
/** The filters of Discover. Discover was at `/` before, so old links have them on `/`. */
const DISCOVER_PARAMS = ["q", "tag", "sort"] as const;

export const metadata: Metadata = {
  title: TITLE,
  description: LANDING_DEFINITION,
  openGraph: { title: TITLE, description: LANDING_DEFINITION, siteName: "Wanderer", type: "website" },
  twitter: { card: "summary", title: TITLE, description: LANDING_DEFINITION },
};

function discoverHref(raw: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const key of DISCOVER_PARAMS) {
    const value = Array.isArray(raw[key]) ? raw[key][0] : raw[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/discover?${query}` : "/discover";
}

/** The most popular public characters. */
async function heroCharacters(): Promise<CharacterCard[]> {
  try {
    const list = await serverApiFetch<CharacterListResponse>("/characters?sort=most_chats");
    return list.items.slice(0, HERO_COUNT);
  } catch {
    // The page works without the row of characters.
    return [];
  }
}

/**
 * The landing page for a visitor. The server renders it, so search engines see the text.
 * A browser with the signed-in hint and an old Discover link with filters go to /discover.
 */
export default async function LandingPage({ searchParams }: { searchParams: SearchParams }) {
  const href = discoverHref(await searchParams);
  if (href !== "/discover" || (await cookies()).has(SIGNED_IN_HINT_COOKIE)) {
    redirect(href);
  }
  return <LandingView characters={await heroCharacters()} />;
}
