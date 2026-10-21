import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AI_ERROR_TEXT,
  type MeResponse,
  PROXY_LIMIT,
  proxyCreateSchema,
  type ProxyTestResult,
  proxyUpdateSchema,
  type ProxyView,
} from "@wanderer/shared";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AI_CLIENT_FACTORY, type AiClientFactory, type AiTarget, proxyEndpoint } from "../ai/ai-client.js";
import { aiErrorLogFields, toAiError } from "../ai/ai-errors.js";
import { assertProxyUrl, BlockedUrlError } from "../ai/url-guard.js";
import { isUuid } from "../common/uuid.js";
import type { Proxy, User } from "../generated/prisma/client.js";
import { MeService } from "../me/me.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { KEY_CIPHER, KeyCipher, KeyDecryptError } from "./key-cipher.js";

const NOT_FOUND = { error: "not_found" };
const TEST_MESSAGE = "Reply with the word OK.";
const TEST_TIMEOUT_MS = 30_000;

function toProxyView(row: Proxy, activeProxyId: string | null): ProxyView {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    appendPath: row.appendPath,
    model: row.model,
    customPrompt: row.customPrompt,
    keyLast4: row.keyLast4,
    isActive: row.id === activeProxyId,
    createdAt: row.createdAt.toISOString(),
  };
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_proxy", fields });
  }
  return parsed.data;
}

/** The static SSRF check at save time. The AI client checks the DNS answer again at each call. */
function assertSafeUrl(baseUrl: string, appendPath: boolean): void {
  try {
    assertProxyUrl(proxyEndpoint(baseUrl, appendPath));
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      throw new BadRequestException({ error: "blocked_url", fields: ["baseUrl"] });
    }
    throw error;
  }
}

@Injectable()
export class ProxiesService {
  private readonly logger = new Logger(ProxiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    @Inject(KEY_CIPHER) private readonly cipher: KeyCipher,
    @Inject(AI_CLIENT_FACTORY) private readonly clients: AiClientFactory,
  ) {}

  async list(user: User): Promise<ProxyView[]> {
    const rows = await this.prisma.proxy.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => toProxyView(row, user.activeProxyId));
  }

  /** Saves a new proxy. The first proxy of a user becomes the active proxy. */
  async create(user: User, body: unknown): Promise<ProxyView> {
    const input = parse(proxyCreateSchema, body);
    assertSafeUrl(input.baseUrl, input.appendPath);
    if ((await this.prisma.proxy.count({ where: { userId: user.id } })) >= PROXY_LIMIT) {
      throw new ConflictException({ error: "proxy_limit" });
    }
    // The AAD of the key holds the proxy ID, so the ID must exist before the encrypt.
    const id = randomUUID();
    const { apiKey, ...fields } = input;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proxy.create({ data: { id, userId: user.id, ...fields, ...this.seal(apiKey, id) } });
      await tx.user.updateMany({ where: { id: user.id, activeProxyId: null }, data: { activeProxyId: id } });
      return created;
    });
    return toProxyView(row, user.activeProxyId ?? id);
  }

  /** Changes the fields that the body sends. An empty or absent apiKey keeps the saved key. */
  async update(user: User, id: string, body: unknown): Promise<ProxyView> {
    const current = await this.findOwn(user, id);
    const { apiKey, ...fields } = parse(proxyUpdateSchema, body);
    assertSafeUrl(fields.baseUrl ?? current.baseUrl, fields.appendPath ?? current.appendPath);
    const row = await this.prisma.proxy.update({
      where: { id },
      data: { ...fields, ...(apiKey ? this.seal(apiKey, id) : {}) },
    });
    return toProxyView(row, user.activeProxyId);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.findOwn(user, id);
    // The foreign key sets activeProxyId to null when this proxy is the active proxy.
    await this.prisma.proxy.delete({ where: { id } });
  }

  async activate(user: User, id: string): Promise<MeResponse> {
    await this.findOwn(user, id);
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { activeProxyId: id } });
    return this.me.toResponse(updated);
  }

  /** Sends one small request to the proxy and gives the result. A failed call is a result, not an error. */
  async test(user: User, id: string): Promise<ProxyTestResult> {
    const row = await this.findOwn(user, id);
    let target: AiTarget;
    try {
      target = this.target(row);
    } catch (error) {
      if (error instanceof KeyDecryptError) {
        return { ok: false, error: "invalid_key", message: AI_ERROR_TEXT.invalid_key };
      }
      throw error;
    }
    const started = Date.now();
    try {
      const completion = await this.clients
        .create(target)
        .chat.completions.create(
          { model: row.model, messages: [{ role: "user", content: TEST_MESSAGE }], max_tokens: 5 },
          { timeout: TEST_TIMEOUT_MS },
        );
      const reply = completion.choices[0]?.message.content?.trim() ?? "";
      return { ok: true, reply, latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn({ msg: "Proxy test failed", ...aiErrorLogFields(error) });
      const code = toAiError(error);
      return { ok: false, error: code, message: AI_ERROR_TEXT[code] };
    }
  }

  /** The decrypted target of the active proxy, for one call. */
  async loadTarget(user: User): Promise<{ target: AiTarget; customPrompt: string }> {
    const row = user.activeProxyId
      ? await this.prisma.proxy.findFirst({ where: { id: user.activeProxyId, userId: user.id } })
      : null;
    if (!row) {
      throw new ConflictException({ error: "no_active_proxy" });
    }
    try {
      return { target: this.target(row), customPrompt: row.customPrompt };
    } catch (error) {
      if (error instanceof KeyDecryptError) {
        // The master key changed. The user must enter the API key again.
        throw new ConflictException({ error: "invalid_key" });
      }
      throw error;
    }
  }

  /** The decrypted target for one call. It throws KeyDecryptError when the saved key does not decrypt. */
  private target(row: Proxy): AiTarget {
    const apiKey = this.cipher.decrypt(
      { ciphertext: row.keyCiphertext, iv: row.keyIv, tag: row.keyTag, version: row.keyVersion },
      row.id,
    );
    return { endpoint: proxyEndpoint(row.baseUrl, row.appendPath), apiKey, model: row.model };
  }

  private seal(apiKey: string, proxyId: string) {
    const sealed = this.cipher.encrypt(apiKey, proxyId);
    return {
      // Prisma Bytes takes a Uint8Array on its own ArrayBuffer, so copy each Buffer.
      keyCiphertext: new Uint8Array(sealed.ciphertext),
      keyIv: new Uint8Array(sealed.iv),
      keyTag: new Uint8Array(sealed.tag),
      keyVersion: sealed.version,
      keyLast4: apiKey.slice(-4),
    };
  }

  private async findOwn(user: User, id: string): Promise<Proxy> {
    const row = isUuid(id) ? await this.prisma.proxy.findFirst({ where: { id, userId: user.id } }) : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }
}
