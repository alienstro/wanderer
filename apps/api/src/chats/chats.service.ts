import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
} from "@wanderer/shared";
import { characterAccess } from "../characters/visibility.js";
import { isUuid } from "../common/uuid.js";
import { fileUrl } from "../files/files.service.js";
import type { Chat, Message, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
} as const;

type DetailChat = ChatWithCharacter & {
  character: Parameters<typeof characterAccess>[0] & { _count: { openings: number } };
  messages: Message[];
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

/** The chats of a user. Each query filters by the user ID of the session, so another user gets 404. */
@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

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
      return tx.chat.create({
        data: {
          userId: user.id,
          characterId,
          title: character.chatName || character.title,
          openingIndex,
          messages: { create: { role: "assistant", content: opening.text, position: 0 } },
        },
        include: detailInclude,
      });
    });
    return toChatDetail(chat, user);
  }

  async list(user: User, characterId: string | undefined): Promise<ChatListResponse> {
    if (characterId !== undefined && !isUuid(characterId)) {
      throw new BadRequestException({ error: "invalid_query" });
    }
    const chats = await this.prisma.chat.findMany({
      where: { userId: user.id, characterId },
      orderBy: { lastMessageAt: "desc" },
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

  async remove(user: User, id: string): Promise<void> {
    await this.findOwn(user, id);
    await this.prisma.chat.delete({ where: { id } });
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
  async loadForReply(
    chatId: string,
    user: User,
  ): Promise<{ chat: Chat; character: PromptCharacter; history: Message[] }> {
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
