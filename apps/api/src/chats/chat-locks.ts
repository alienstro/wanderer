import { ConflictException, Injectable } from "@nestjs/common";

/**
 * One lock for each chat of a user. A reply stream and an opening change hold it, so they never run at the same time.
 * The API runs as one container, so memory is enough.
 */
@Injectable()
export class ChatLocks {
  /** The "<user ID>:<chat ID>" keys of the held locks. */
  private readonly held = new Set<string>();

  /** Runs `fn` while it holds the lock of the chat. A held lock gives 409 chat_busy. */
  async run<T>(userId: string, chatId: string, fn: () => Promise<T>): Promise<T> {
    // The key holds the user ID, so another user never meets the owner's lock and gets 404 from the load.
    const key = `${userId}:${chatId}`;
    if (this.held.has(key)) {
      throw new ConflictException({ error: "chat_busy" });
    }
    this.held.add(key);
    try {
      return await fn();
    } finally {
      this.held.delete(key);
    }
  }
}
