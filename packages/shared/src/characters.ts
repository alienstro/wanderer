import { z } from "zod";

/** The tag list from the prototype. A character has 0 to 10 of these tags. */
export const TAGS = [
  { slug: "adventure", label: "Adventure" },
  { slug: "fantasy", label: "Fantasy" },
  { slug: "horror", label: "Horror" },
  { slug: "military", label: "Military" },
  { slug: "mystery", label: "Mystery" },
  { slug: "noir", label: "Noir" },
  { slug: "post-apoc", label: "PostApoc" },
  { slug: "school", label: "School" },
  { slug: "sci-fi", label: "SciFi" },
  { slug: "slice-of-life", label: "SliceOfLife" },
] as const;

export type TagSlug = (typeof TAGS)[number]["slug"];
export type Tag = { slug: TagSlug; label: string };

const TAG_SLUGS = TAGS.map((tag) => tag.slug) as [TagSlug, ...TagSlug[]];

export const tagSlugSchema = z.enum(TAG_SLUGS);

export const TITLE_MAX = 60;
export const CHAT_NAME_MAX = 60;
export const BIO_MAX = 2_000;
export const PERSONALITY_MAX = 8_000;
export const SCENARIO_MAX = 4_000;
export const EXAMPLE_DIALOGS_MAX = 8_000;
export const OPENINGS_MAX = 10;
export const OPENING_MAX = 4_000;
export const TAGS_MAX = 10;
export const SEARCH_MAX = 100;
/** The largest image upload: 5 MB. */
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** The fields of the create and edit form. The same schema runs in the browser and in the API. */
export const characterInputSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  chatName: z.string().trim().max(CHAT_NAME_MAX).default(""),
  bio: z.string().trim().min(1).max(BIO_MAX),
  tags: z
    .array(tagSlugSchema)
    .max(TAGS_MAX)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  isAdult: z.boolean().default(false),
  personality: z.string().trim().min(1).max(PERSONALITY_MAX),
  scenario: z.string().trim().max(SCENARIO_MAX).default(""),
  openings: z.array(z.string().trim().min(1).max(OPENING_MAX)).min(1).max(OPENINGS_MAX),
  exampleDialogs: z.string().trim().max(EXAMPLE_DIALOGS_MAX).default(""),
  avatarFileId: z.uuid().nullable().default(null),
  isPublic: z.boolean().default(true),
  definitionVisible: z.boolean().default(true),
  /** True publishes the character. False keeps it as a draft. */
  publish: z.boolean().default(false),
});

export type CharacterInput = z.infer<typeof characterInputSchema>;

export const characterSortSchema = z.enum(["most_chats", "newest"]);

export const characterListQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_MAX).optional(),
  tag: tagSlugSchema.optional(),
  sort: characterSortSchema.default("most_chats"),
  cursor: z.string().max(200).optional(),
});

export type CharacterListQuery = z.infer<typeof characterListQuerySchema>;

export type CharacterStatus = "draft" | "published" | "hidden";

export type CharacterCard = {
  id: string;
  title: string;
  chatName: string;
  /** A path such as `/files/<id>`, or null when the character has no avatar. */
  avatarUrl: string | null;
  isAdult: boolean;
  tags: Tag[];
  chatCount: number;
  creatorHandle: string;
};

export type CharacterDetail = CharacterCard & {
  bio: string;
  status: CharacterStatus;
  isPublic: boolean;
  definitionVisible: boolean;
  openings: string[];
  /** Null when the creator hides the definition and the viewer is not the creator. */
  definition: { personality: string; scenario: string; exampleDialogs: string } | null;
  isOwner: boolean;
  createdAt: string;
};

export type MyCharacterCard = CharacterCard & { status: CharacterStatus; isPublic: boolean };

export type CharacterListResponse = { items: CharacterCard[]; nextCursor: string | null };
