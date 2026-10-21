import { inflateSync } from "node:zlib";
import {
  BIO_MAX,
  type CharacterInput,
  EXAMPLE_DIALOGS_MAX,
  OPENING_MAX,
  OPENINGS_MAX,
  PERSONALITY_MAX,
  SCENARIO_MAX,
  TAGS,
  TAGS_MAX,
  type TagSlug,
  TITLE_MAX,
} from "@wanderer/shared";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A compressed iTXt chunk cannot grow past this size, so a small file cannot fill the memory. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Reads the tEXt and iTXt chunks of a PNG into a map from keyword to text. */
function readTextChunks(png: Buffer): Map<string, string> {
  const texts = new Map<string, string>();
  if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return texts;
  }
  let offset = PNG_SIGNATURE.length;
  // Each chunk has a length (4 bytes), a type (4), the data, and a CRC (4).
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > png.length) {
      break;
    }
    const data = png.subarray(start, end);
    if (type === "tEXt") {
      const zero = data.indexOf(0);
      if (zero > 0) {
        texts.set(data.toString("latin1", 0, zero), data.toString("latin1", zero + 1));
      }
    } else if (type === "iTXt") {
      const text = readItxt(data);
      if (text) {
        texts.set(text.keyword, text.text);
      }
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  return texts;
}

/** iTXt: keyword, 0, compression flag, compression method, language, 0, translated keyword, 0, text. */
function readItxt(data: Buffer): { keyword: string; text: string } | null {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd <= 0 || keywordEnd + 3 > data.length) {
    return null;
  }
  const compressed = data[keywordEnd + 1] === 1;
  const languageEnd = data.indexOf(0, keywordEnd + 3);
  const translatedEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
  if (translatedEnd < 0) {
    return null;
  }
  const body = data.subarray(translatedEnd + 1);
  try {
    const text = compressed ? inflateSync(body, { maxOutputLength: MAX_TEXT_BYTES }) : body;
    return { keyword: data.toString("latin1", 0, keywordEnd), text: text.toString("utf8") };
  } catch {
    return null;
  }
}

function decodeCard(text: string | undefined): Record<string, unknown> | null {
  const trimmed = text?.trim();
  if (!trimmed || !BASE64_PATTERN.test(trimmed)) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
    if (typeof json !== "object" || json === null) {
      return null;
    }
    // A V2 or V3 card keeps the fields in "data". A V1 card keeps them at the top.
    const data = (json as { data?: unknown }).data ?? json;
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toTagSlugs(value: unknown): TagSlug[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const wanted = new Set(value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase()));
  return TAGS.filter((tag) => wanted.has(tag.slug) || wanted.has(tag.label.toLowerCase()))
    .map((tag) => tag.slug)
    .slice(0, TAGS_MAX);
}

/**
 * Reads a Tavern character card (V1, V2, or V3) from a PNG. A "ccv3" chunk wins over a "chara" chunk.
 * It gives the form fields that the card fills, cut to the field limits, or null when the PNG has no valid card.
 */
export function readTavernCard(png: Buffer): Partial<CharacterInput> | null {
  const texts = readTextChunks(png);
  const card = decodeCard(texts.get("ccv3")) ?? decodeCard(texts.get("chara"));
  if (!card) {
    return null;
  }

  const personality = [text(card.description, PERSONALITY_MAX), text(card.personality, PERSONALITY_MAX)]
    .filter((part) => part.length > 0)
    .join("\n\n")
    .slice(0, PERSONALITY_MAX);
  const greetings = Array.isArray(card.alternate_greetings) ? (card.alternate_greetings as unknown[]) : [];
  const openings = [card.first_mes, ...greetings]
    .map((opening) => text(opening, OPENING_MAX))
    .filter((opening) => opening.length > 0)
    .slice(0, OPENINGS_MAX);

  const draft: Partial<CharacterInput> = {
    title: text(card.name, TITLE_MAX),
    bio: text(card.creator_notes, BIO_MAX),
    personality,
    scenario: text(card.scenario, SCENARIO_MAX),
    openings,
    exampleDialogs: text(card.mes_example, EXAMPLE_DIALOGS_MAX),
    tags: toTagSlugs(card.tags),
  };
  // Leave out the empty fields, so that the form keeps its defaults.
  return Object.fromEntries(
    Object.entries(draft).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== "")),
  ) as Partial<CharacterInput>;
}
