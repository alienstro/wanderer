import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { FILE_STORAGE, type FileStorage } from "./file-storage.js";
import { toAvatarWebp } from "./image.js";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fileUrl(id: string): string {
  return `/files/${id}`;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Stores a clean WebP copy of the image. It throws InvalidImageError and stores nothing for a bad image. */
  async saveAvatar(ownerId: string, input: Buffer): Promise<{ id: string; url: string }> {
    const avatar = await toAvatarWebp(input);
    const id = randomUUID();
    const path = `${id}.webp`;
    await this.storage.save(path, avatar.data);
    try {
      await this.prisma.file.create({
        data: { id, ownerId, path, mime: "image/webp", size: avatar.data.length, width: avatar.width, height: avatar.height },
      });
    } catch (error) {
      await this.storage.remove(path);
      throw error;
    }
    return { id, url: fileUrl(id) };
  }

  /** Gives the bytes of a file, or null for an unknown ID. */
  async read(id: string): Promise<Buffer | null> {
    if (!UUID_PATTERN.test(id)) {
      return null;
    }
    const file = await this.prisma.file.findUnique({ where: { id } });
    return file ? this.storage.read(file.path) : null;
  }
}
