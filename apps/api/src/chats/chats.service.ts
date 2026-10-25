import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type ChatDetail,
  type ChatListResponse,
  type ChatMemory,
  type ChatSummary,
  createChatSchema,
  LAST_MESSAGE_MAX,
  memoryInputSchema,
  messageInputSchema,
  type MessageView,
  openingInputSchema,
  type SceneView,
} from "@wanderer/shared";
import { characterAccess } from "../characters/visibility.js";
import { isUuid } from "../common/uuid.js";
import { FilesService, fileUrl } from "../files/files.service.js";
import type { Chat, Message, SceneImage, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChatLocks } from "./chat-locks.js";
import type { PromptCharacter } from "./prompt.js";

const NOT_FOUND = { error: "not_found" };
const LIST_LIMIT = 20;

const characterSelect = {
  id: true,
  title: true,
  chatName: true,
  avatarFileId: true,
  creatorId: true,
  status: true,
  isPublic: true,
  isAdult: true,
} as const;

type ChatWithCharacter = Chat & {
  character: { id: string; title: string; chatName: string; avatarFileId: string | null };
};

/** The chat detail also needs the number of openings, so the page can draw the counter. */
const detailInclude = {
  character: { select: { ...characterSelect, _count: { select: { openings: true } } } },
  messages: { orderBy: { position: "asc" } },
  // A scene row with no file is only a count for the daily limit.
  sceneImages: { where: { fileId: { not: null } }, orderBy: { createdAt: "asc" } },
} as const;

type DetailChat = ChatWithCharacter & {
  character: Parameters<typeof characterAccess>[0] & { _count: { openings: number } };
  messages: Message[];
  sceneImages: SceneImage[];
};

/** The creator can delete openings after the chat starts, so the index stops at the last opening. */
function toChatDetail(chat: DetailChat, user: User): ChatDetail {
  const count = chat.character._count.openings;
  return {
    chat: toChatSummary(chat, chat.messages.at(-1), chat.messages.length),
    messages: chat.messages.map(toMessageView),
    memory: toChatMemory(chat),
    canSend: characterAccess(chat.character, user) === "ok",
    opening: { index: Math.max(0, Math.min(chat.openingIndex, count - 1)), count },
    scenes: chat.sceneImages.map(toSceneView),
    personaName: chat.personaName,
  };
}

/** Give only a row with a file. */
export function toSceneView(row: SceneImage): SceneView {
  return {
    id: row.id,
    url: fileUrl(row.fileId ?? ""),
    afterPosition: row.afterPosition,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMessageView(row: Message): MessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    position: row.position,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toChatMemory(chat: Chat): ChatMemory {
  return { text: chat.memory, throughPosition: chat.memoryThroughPosition };
}

function toChatSummary(chat: ChatWithCharacter, last: Message | undefined, messageCount: number): ChatSummary {
  const { character } = chat;
  return {
    id: chat.id,
    title: chat.title,
    character: {
      id: character.id,
      title: character.title,
      chatName: character.chatName,
      avatarUrl: character.avatarFileId ? fileUrl(character.avatarFileId) : null,
    },
    lastMessage: (last?.content ?? "").slice(0, LAST_MESSAGE_MAX),
    lastMessageAt: chat.lastMessageAt.toISOString(),
    messageCount,
  };
}

/** The chat, the character, and the history for a call to the proxy. */
export interface ReplyContext {
  chat: Chat;
  character: PromptCharacter & { isAdult: boolean };
  history: Message[];
}

/** The chats of a user. Each query filters by the user ID of the session, so another user gets 404. */
@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: ChatLocks,
    private readonly files: FilesService,
  ) {}

  /** Starts a chat from one opening of the character. The opening is message 0, with role assistant. */
  async create(user: User, body: unknown): Promise<ChatDetail> {
    const parsed = createChatSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_chat" });
    }
    const { characterId, openingIndex } = parsed.data;
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: { ...characterSelect, openings: { orderBy: { position: "asc" } } },
    });
    const access = character ? characterAccess(character, user) : "not_found";
    if (!character || access === "not_found") {
      throw new NotFoundException(NOT_FOUND);
    }
    if (access === "adult_content") {
      throw new ForbiddenException({ error: "adult_content" });
    }
    const opening = character.openings[openingIndex];
    if (!opening) {
      throw new BadRequestException({ error: "invalid_opening" });
    }
    const chat = await this.prisma.$transaction(async (tx) => {
      // The chat count goes up for each new chat and does not go down when a chat is deleted.
      await tx.character.update({ where: { id: characterId }, data: { chatCount: { increment: 1 } } });
      // The chat keeps a copy of the default persona. A later edit or delete of the persona does not change it.
      const persona = await tx.persona.findFirst({ where: { userId: user.id, isDefault: true } });
      return tx.chat.create({
        data: {
          userId: user.id,
          characterId,
          title: character.chatName || character.title,
          openingIndex,
          personaName: persona?.name ?? null,
          personaDescription: persona?.description ?? null,
          messages: { create: { role: "assistant", content: opening.text, position: 0 } },
        },
        include: detailInclude,
      });
    });
    return toChatDetail(chat, user);
  }

  /** With `latestPerCharacter` "true", the list has only the newest chat of each character. */
  async list(
    user: User,
    characterId: string | undefined,
    latestPerCharacter: string | undefined,
  ): Promise<ChatListResponse> {
    if (
      (characterId !== undefined && !isUuid(characterId)) ||
      (latestPerCharacter !== undefined && latestPerCharacter !== "true")
    ) {
      throw new BadRequestException({ error: "invalid_query" });
    }
    const chats = await this.prisma.chat.findMany({
      where: { userId: user.id, characterId },
      orderBy: { lastMessageAt: "desc" },
      // Prisma keeps the first chat of each character in the order above, so the newest chat stays.
      distinct: latestPerCharacter === "true" ? ["characterId"] : undefined,
      take: LIST_LIMIT,
      // The count comes in the same query, so the list does not load each message.
      include: {
        character: { select: characterSelect },
        messages: { orderBy: { position: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return { items: chats.map((chat) => toChatSummary(chat, chat.messages[0], chat._count.messages)) };
  }

  async get(user: User, id: string): Promise<ChatDetail> {
    return toChatDetail(await this.findOwn(user, id), user);
  }

  /**
   * Puts another opening of the character in message 0. It works only while the chat has no other message.
   * The chat lock stops a reply that starts at the same time.
   */
  async setOpening(user: User, id: string, body: unknown): Promise<ChatDetail> {
    const parsed = openingInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_opening" });
    }
    const { openingIndex } = parsed.data;
    const chat = isUuid(id)
      ? await this.prisma.chat.findFirst({
          where: { id, userId: user.id },
          select: { character: { select: { ...characterSelect, openings: { where: { position: openingIndex } } } } },
        })
      : null;
    // A character that the user cannot see now gives 404, as a reply does, so a hidden opening never shows.
    if (!chat || characterAccess(chat.character, user) !== "ok") {
      throw new NotFoundException(NOT_FOUND);
    }
    const opening = chat.character.openings[0];
    if (!opening) {
      throw new BadRequestException({ error: "invalid_opening" });
    }
    await this.locks.run(user.id, id, () =>
      this.prisma.$transaction(async (tx) => {
        // The check and the write are one statement, so a message that another request saves cannot come between them.
        const { count } = await tx.message.updateMany({
          where: { chatId: id, position: 0, chat: { messages: { none: { position: { gt: 0 } } } } },
          data: { content: opening.text },
        });
        if (count === 0) {
          throw new ConflictException({ error: "opening_locked" });
        }
        await tx.chat.update({ where: { id }, data: { openingIndex } });
      }),
    );
    return this.get(user, id);
  }

  /** Deletes the chat and its scene images. The scene rows stay, so the daily limit still counts them. */
  async remove(user: User, id: string): Promise<void> {
    await this.findOwn(user, id);
    const scenes = await this.prisma.file.findMany({ where: { sceneImage: { chatId: id } }, select: { id: true, path: true } });
    await this.prisma.$transaction([
      this.files.deleteRows(scenes.map((file) => file.id)),
      this.prisma.chat.delete({ where: { id } }),
    ]);
    await this.files.removeBytes(scenes.map((file) => file.path));
  }

  /** Saves the memory. A body without `throughPosition` keeps the saved marker. */
  async updateMemory(user: User, id: string, body: unknown): Promise<ChatMemory> {
    const parsed = memoryInputSchema.safeParse(body);
    const chat = await this.findOwn(user, id);
    const lastPosition = chat.messages.at(-1)?.position ?? 0;
    if (!parsed.success || (parsed.data.throughPosition ?? 0) > lastPosition) {
      throw new BadRequestException({ error: "invalid_memory" });
    }
    const row = await this.prisma.chat.update({
      where: { id: chat.id },
      data: { memory: parsed.data.memory, memoryThroughPosition: parsed.data.throughPosition },
    });
    return toChatMemory(row);
  }

  /** Changes the text of a user message. An edit does not start a new reply. */
  async updateMessage(user: User, id: string, body: unknown): Promise<MessageView> {
    const parsed = messageInputSchema.safeParse(body);
    await this.findOwnUserMessage(user, id);
    if (!parsed.success) {
      throw new BadRequestException({ error: "invalid_message" });
    }
    const row = await this.prisma.message.update({
      where: { id },
      data: { content: parsed.data.content, editedAt: new Date() },
    });
    return toMessageView(row);
  }

  async removeMessage(user: User, id: string): Promise<void> {
    await this.findOwnUserMessage(user, id);
    await this.prisma.message.delete({ where: { id } });
  }

  /**
   * The chat, the character definition, and the history for a call to the proxy. A character that the user
   * cannot see now gives 404, so the prompt never holds a hidden definition.
   */
  async loadForReply(chatId: string, user: User): Promise<ReplyContext> {
    const chat = isUuid(chatId)
      ? await this.prisma.chat.findFirst({
          where: { id: chatId, userId: user.id },
          include: { character: true, messages: { orderBy: { position: "asc" } } },
        })
      : null;
    if (!chat || characterAccess(chat.character, user) !== "ok") {
      throw new NotFoundException(NOT_FOUND);
    }
    const { character, messages, ...rest } = chat;
    return { chat: rest, character, history: messages };
  }

  private async findOwn(user: User, id: string) {
    const chat = isUuid(id)
      ? await this.prisma.chat.findFirst({
          where: { id, userId: user.id },
          include: detailInclude,
        })
      : null;
    if (!chat) {
      throw new NotFoundException(NOT_FOUND);
    }
    return chat;
  }

  /** Only the owner of the chat can change a message, and only a user message. */
  private async findOwnUserMessage(user: User, id: string): Promise<Message> {
    const message = isUuid(id)
      ? await this.prisma.message.findFirst({ where: { id, role: "user", chat: { userId: user.id } } })
      : null;
    if (!message) {
      throw new NotFoundException(NOT_FOUND);
    }
    return message;
  }
}
