import type { FileStorage } from "../../src/files/file-storage.js";

/** Keeps the files in memory, so that the tests do not write to the disk. */
export class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();

  save(key: string, data: Buffer): Promise<void> {
    this.files.set(key, data);
    return Promise.resolve();
  }

  read(key: string): Promise<Buffer> {
    const data = this.files.get(key);
    // The same error code as the disk storage, so the tests see the real behavior.
    return data ? Promise.resolve(data) : Promise.reject(Object.assign(new Error(`No file ${key}`), { code: "ENOENT" }));
  }

  remove(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}
