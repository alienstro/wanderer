import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { isUuid } from "../common/uuid.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FILE_STORAGE, type FileStorage } from "./file-storage.js";
import { toAvatarWebp } from "./image.js";

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
    if (!isUuid(id)) {
      return null;
    }
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) {
      return null;
    }
    try {
      return await this.storage.read(file.path);
    } catch (error) {
      // A row with no bytes is a lost file, for example after a deploy without the volume.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /** Deletes a file row and its bytes. It does nothing for an unknown ID. */
  async remove(id: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) {
      return;
    }
    await this.prisma.file.delete({ where: { id } });
    await this.storage.remove(file.path);
  }
}
