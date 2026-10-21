import { BadRequestException, Injectable } from "@nestjs/common";
import type { CharacterListQuery, CharacterListResponse, MyCharacterCard } from "@wanderer/shared";
import { Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { canSeeAdult } from "./adult.js";
import { type CharacterCardRow, characterCardInclude, toCharacterCard } from "./character-mapper.js";
import { type CursorKey, decodeCursor, encodeCursor } from "./cursor.js";

export const PAGE_SIZE = 24;

interface KeyRow {
  id: string;
  chat_count: number;
  created_at: Date;
}

/** Escapes the LIKE wildcards, so that "%" and "_" match only themselves. The query uses ESCAPE '\'. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

@Injectable()
export class CharacterListService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Discover list: published, public characters. Postgres applies every filter, the 18+ filter too. */
  async discover(query: CharacterListQuery, viewer: User | null): Promise<CharacterListResponse> {
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new BadRequestException({ error: "invalid_cursor" });
    }

    const conditions: Prisma.Sql[] = [Prisma.sql`c.status = 'published'`, Prisma.sql`c.is_public`];
    if (!canSeeAdult(viewer)) {
      conditions.push(Prisma.sql`NOT c.is_adult`);
    }
    if (query.tag) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM character_tags ct WHERE ct.character_id = c.id AND ct.tag_slug = ${query.tag})`,
      );
    }
    if (query.q) {
      const pattern = likePattern(query.q);
      conditions.push(Prisma.sql`(
        c.title ILIKE ${pattern} ESCAPE '\\'
        OR c.chat_name ILIKE ${pattern} ESCAPE '\\'
        OR u.handle ILIKE ${pattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM character_tags ct JOIN tags t ON t.slug = ct.tag_slug
          WHERE ct.character_id = c.id AND t.label ILIKE ${pattern} ESCAPE '\\'
        )
      )`);
    }

    const mostChats = query.sort === "most_chats";
    if (after) {
      // The cursor keeps the time as an ISO string in UTC. The column is a timestamp in UTC with no zone.
      const createdAt = Prisma.sql`CAST(${after.createdAt} AS timestamp(3))`;
      conditions.push(
        mostChats
          ? Prisma.sql`(c.chat_count, c.created_at, c.id) < (${after.chatCount}, ${createdAt}, CAST(${after.id} AS uuid))`
          : Prisma.sql`(c.created_at, c.id) < (${createdAt}, CAST(${after.id} AS uuid))`,
      );
    }
    const orderBy = mostChats
      ? Prisma.sql`c.chat_count DESC, c.created_at DESC, c.id DESC`
      : Prisma.sql`c.created_at DESC, c.id DESC`;

    // One extra row tells if a next page exists.
    const keys = await this.prisma.$queryRaw<KeyRow[]>`
      SELECT c.id, c.chat_count, c.created_at
      FROM characters c JOIN users u ON u.id = c.creator_id
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${orderBy}
      LIMIT ${PAGE_SIZE + 1}`;

    const page = keys.slice(0, PAGE_SIZE);
    const rows = await this.prisma.character.findMany({
      where: { id: { in: page.map((key) => key.id) } },
      include: characterCardInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = page
      .map((key) => byId.get(key.id))
      .filter((row): row is CharacterCardRow => row !== undefined)
      .map(toCharacterCard);

    const last = page.at(-1);
    const nextCursor =
      keys.length > PAGE_SIZE && last
        ? encodeCursor({ chatCount: last.chat_count, createdAt: last.created_at.toISOString(), id: last.id } satisfies CursorKey)
        : null;
    return { items, nextCursor };
  }

  /** All characters of one user, newest first: drafts, private, and hidden too. */
  async mine(user: User): Promise<MyCharacterCard[]> {
    const rows = await this.prisma.character.findMany({
      where: { creatorId: user.id },
      include: characterCardInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({ ...toCharacterCard(row), status: row.status, isPublic: row.isPublic }));
  }
}
