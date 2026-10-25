import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PERSONA_LIMIT, type Persona, type PersonaInput, type PersonaListResponse } from "@wanderer/shared";
import { isUuid } from "../common/uuid.js";
import type { Persona as PersonaRow, Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const NOT_FOUND = { error: "not_found" };
const OLDEST_FIRST = [{ createdAt: "asc" }, { id: "asc" }] satisfies Prisma.PersonaOrderByWithRelationInput[];

function toPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Locks the user row until the transaction ends. Two requests of one user then run one after the other,
 * so a race cannot make a 4th persona or a second default. The lock only reads the users table.
 */
async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** The personas of a user. Each query filters by the user ID of the session, so another user gets 404. */
@Injectable()
export class PersonasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: User): Promise<PersonaListResponse> {
    const rows = await this.prisma.persona.findMany({ where: { userId: user.id }, orderBy: OLDEST_FIRST });
    return { personas: rows.map(toPersona) };
  }

  /** Adds a persona. The first persona of the user becomes the default. */
  async create(user: User, input: PersonaInput): Promise<Persona> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const count = await tx.persona.count({ where: { userId: user.id } });
      if (count >= PERSONA_LIMIT) {
        throw new ConflictException({ error: "persona_limit" });
      }
      return tx.persona.create({ data: { userId: user.id, ...input, isDefault: count === 0 } });
    });
    return toPersona(row);
  }

  /** Changes the name and the description. Old chats keep their copy of the persona. */
  async update(user: User, id: string, input: PersonaInput): Promise<Persona> {
    await this.findOwn(user, id);
    return toPersona(await this.prisma.persona.update({ where: { id }, data: input }));
  }

  /** Makes this persona the default. A call on the default changes nothing. */
  async makeDefault(user: User, id: string): Promise<PersonaListResponse> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await this.findOwn(user, id, tx);
      // Clear the old default first. The partial unique index allows one default for each user.
      await tx.persona.updateMany({ where: { userId: user.id, isDefault: true, NOT: { id } }, data: { isDefault: false } });
      await tx.persona.update({ where: { id }, data: { isDefault: true } });
    });
    return this.list(user);
  }

  /** Deletes the persona. When it was the default, the oldest other persona becomes the default. */
  async remove(user: User, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const row = await this.findOwn(user, id, tx);
      await tx.persona.delete({ where: { id } });
      if (!row.isDefault) {
        return;
      }
      const next = await tx.persona.findFirst({ where: { userId: user.id }, orderBy: OLDEST_FIRST });
      if (next) {
        await tx.persona.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  /** The persona row of the user. A persona of another user, or a bad ID, gives 404. */
  private async findOwn(user: User, id: string, client: Prisma.TransactionClient = this.prisma): Promise<PersonaRow> {
    const row = isUuid(id) ? await client.persona.findFirst({ where: { id, userId: user.id } }) : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }
}
