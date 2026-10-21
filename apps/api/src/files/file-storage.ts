import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Keeps the bytes of the uploaded files. A key is `<uuid>.webp`. */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

/** The Nest injection token for the FileStorage. */
export const FILE_STORAGE = Symbol("FILE_STORAGE");

const KEY_PATTERN = /^[0-9a-f-]{36}\.webp$/;

/** Keeps the files in one directory on the disk. In Docker, this directory is a volume. */
export class LocalDiskStorage implements FileStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  async save(key: string, data: Buffer): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    // "wx" fails when the file exists, so a save never replaces a file.
    await writeFile(this.pathOf(key), data, { flag: "wx" });
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  remove(key: string): Promise<void> {
    return rm(this.pathOf(key), { force: true });
  }

  /** Accepts only a key that the API makes, so a key cannot point out of the directory. */
  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid file key: ${key}`);
    }
    return join(this.rootDir, key);
  }
}
