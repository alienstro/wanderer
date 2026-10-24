import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  API_KEY_LIMIT,
  apiKeyCreateSchema,
  type ApiKeyInUse,
  apiKeyUpdateSchema,
  type ApiKeyView,
} from "@wanderer/shared";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { isUuid } from "../common/uuid.js";
import { type ApiKey, Prisma, type User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { KEY_CIPHER, KeyCipher } from "./key-cipher.js";

const NOT_FOUND = { error: "not_found" };

type ApiKeyWithCount = ApiKey & { _count: { proxies: number } };

const WITH_COUNT = { _count: { select: { proxies: true } } } as const;

function toApiKeyView(row: ApiKeyWithCount): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    keyLast4: row.keyLast4,
    modelCount: row._count.proxies,
    createdAt: row.createdAt.toISOString(),
  };
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_api_key", fields });
  }
  return parsed.data;
}

/** The saved API keys of a user. No answer has the key, only its last 4 characters. */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KEY_CIPHER) private readonly cipher: KeyCipher,
  ) {}

  async list(user: User): Promise<ApiKeyView[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: WITH_COUNT,
    });
    return rows.map(toApiKeyView);
  }

  async create(user: User, body: unknown): Promise<ApiKeyView> {
    const { name, apiKey } = parse(apiKeyCreateSchema, body);
    if ((await this.prisma.apiKey.count({ where: { userId: user.id } })) >= API_KEY_LIMIT) {
      throw new ConflictException({ error: "api_key_limit" });
    }
    // The AAD of the key holds the key ID, so the ID must exist before the encrypt.
    const id = randomUUID();
    const row = await this.prisma.apiKey.create({
      data: { id, userId: user.id, name, ...this.seal(apiKey, id) },
      include: WITH_COUNT,
    });
    return toApiKeyView(row);
  }

  /** Changes the name, the key, or both. A new key applies at once to each model that uses it. */
  async update(user: User, id: string, body: unknown): Promise<ApiKeyView> {
    await this.findOwn(user, id);
    const { name, apiKey } = parse(apiKeyUpdateSchema, body);
    const row = await this.prisma.apiKey.update({
      where: { id },
      data: { name, ...(apiKey ? this.seal(apiKey, id) : {}) },
      include: WITH_COUNT,
    });
    return toApiKeyView(row);
  }

  /** Deletes a key that no model uses. A key in use gives 409 with the names of those models. */
  async remove(user: User, id: string): Promise<void> {
    await this.findOwn(user, id);
    await this.assertNotInUse(id);
    try {
      await this.prisma.apiKey.delete({ where: { id } });
    } catch (error) {
      // A model that took this key after the check makes the foreign key fail.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        await this.assertNotInUse(id);
      }
      throw error;
    }
  }

  /** The key row of the user. A key of another user, or a bad ID, gives 404. */
  async findOwn(user: User, id: string): Promise<ApiKey> {
    const row = isUuid(id) ? await this.prisma.apiKey.findFirst({ where: { id, userId: user.id } }) : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }

  /** The plain key for one call. It throws KeyDecryptError when the saved key does not decrypt. */
  decrypt(row: ApiKey): string {
    return this.cipher.decrypt(
      { ciphertext: row.keyCiphertext, iv: row.keyIv, tag: row.keyTag, version: row.keyVersion },
      row.id,
    );
  }

  private async assertNotInUse(id: string): Promise<void> {
    const models = await this.prisma.proxy.findMany({
      where: { apiKeyId: id },
      orderBy: { createdAt: "asc" },
      select: { name: true },
    });
    if (models.length > 0) {
      const body: ApiKeyInUse = { error: "api_key_in_use", models: models.map((model) => model.name) };
      throw new ConflictException(body);
    }
  }

  private seal(apiKey: string, apiKeyId: string) {
    const sealed = this.cipher.encrypt(apiKey, apiKeyId);
    return {
      // Prisma Bytes takes a Uint8Array on its own ArrayBuffer, so copy each Buffer.
      keyCiphertext: new Uint8Array(sealed.ciphertext),
      keyIv: new Uint8Array(sealed.iv),
      keyTag: new Uint8Array(sealed.tag),
      keyVersion: sealed.version,
      keyLast4: apiKey.slice(-4),
    };
  }
}
