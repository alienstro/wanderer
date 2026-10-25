import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { isUuid } from "../common/uuid.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FILE_STORAGE, type FileStorage } from "./file-storage.js";
import { toAvatarWebp, toSceneWebp } from "./image.js";

export function fileUrl(id: string): string {
  return `/files/${id}`;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Stores a clean WebP copy of the image. It throws InvalidImageError and stores nothing for a bad image. */
  async saveAvatar(ownerId: string, input: Buffer): Promise<{ id: string; url: string }> {
    return this.saveWebp(ownerId, await toAvatarWebp(input));
  }

  /** Stores a 1024×1024 WebP copy of a scene image. It throws InvalidImageError for broken bytes. */
  async saveScene(ownerId: string, input: Buffer): Promise<{ id: string; url: string }> {
    return this.saveWebp(ownerId, await toSceneWebp(input));
  }

  private async saveWebp(
    ownerId: string,
    image: { data: Buffer; width: number; height: number },
  ): Promise<{ id: string; url: string }> {
    const id = randomUUID();
    const path = `${id}.webp`;
    await this.storage.save(path, image.data);
    try {
      await this.prisma.file.create({
        data: { id, ownerId, path, mime: "image/webp", size: image.data.length, width: image.width, height: image.height },
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

  /** Gives the stored paths of all files of the owner. */
  async pathsOf(ownerId: string): Promise<string[]> {
    const files = await this.prisma.file.findMany({ where: { ownerId }, select: { path: true } });
    return files.map((file) => file.path);
  }

  /**
   * Removes the bytes after the rows are gone. A storage error goes to the log and does not stop the
   * other removals, because the rows are already deleted.
   */
  async removeBytes(paths: string[]): Promise<void> {
    for (const path of paths) {
      try {
        await this.storage.remove(path);
      } catch (error) {
        this.logger.warn(`The file ${path} was not removed: ${String(error)}`);
      }
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
