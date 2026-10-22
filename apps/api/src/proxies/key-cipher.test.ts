import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testEnv } from "../../test/support/env.js";
import { KeyCipher, KeyDecryptError } from "./key-cipher.js";

const cipher = new KeyCipher(randomBytes(32));
const proxyId = "0b6f3c2e-1d7a-4f6e-8a51-3c9d2e7f4a10";

describe("KeyCipher", () => {
  it("decrypt gives back the text that encrypt sealed", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", proxyId);
    expect(sealed.version).toBe(1);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(cipher.decrypt(sealed, proxyId)).toBe("sk-live-abc3f9a");
  });

  it("two encrypts of one key give two different IVs and ciphertexts", () => {
    const one = cipher.encrypt("sk-live-abc3f9a", proxyId);
    const two = cipher.encrypt("sk-live-abc3f9a", proxyId);
    expect(one.iv.equals(two.iv)).toBe(false);
    expect(one.ciphertext.equals(two.ciphertext)).toBe(false);
  });

  it("decrypt with another proxy ID throws KeyDecryptError", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", proxyId);
    expect(() => cipher.decrypt(sealed, "5a1e9d4c-2b3f-4c6d-9e8f-7a6b5c4d3e21")).toThrow(KeyDecryptError);
  });

  it("decrypt with a changed tag throws KeyDecryptError", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", proxyId);
    const tag = Buffer.from(sealed.tag);
    tag[0] = (tag[0] ?? 0) ^ 1;
    expect(() => cipher.decrypt({ ...sealed, tag }, proxyId)).toThrow(KeyDecryptError);
    expect(() => cipher.decrypt({ ...sealed, version: 2 }, proxyId)).toThrow(KeyDecryptError);
  });

  it("loadEnv refuses a KEY_ENCRYPTION_KEY of 31 bytes and a missing one", () => {
    expect(() => testEnv({ KEY_ENCRYPTION_KEY: randomBytes(31).toString("base64") })).toThrow(/KEY_ENCRYPTION_KEY/);
    expect(() => testEnv({ KEY_ENCRYPTION_KEY: "" })).toThrow(/KEY_ENCRYPTION_KEY/);
    expect(testEnv().KEY_ENCRYPTION_KEY).toHaveLength(32);
  });
});
