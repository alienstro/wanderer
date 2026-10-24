import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testEnv } from "../../test/support/env.js";
import { KeyCipher, KeyDecryptError } from "./key-cipher.js";

const masterKey = randomBytes(32);
const cipher = new KeyCipher(masterKey);
const keyId = "0b6f3c2e-1d7a-4f6e-8a51-3c9d2e7f4a10";

/** A key as the proxy rows sealed it before the saved keys: version 1, with the AAD "proxy:<id>". */
function sealVersion1(plain: string, proxyId: string) {
  const iv = randomBytes(12);
  const legacy = createCipheriv("aes-256-gcm", masterKey, iv);
  legacy.setAAD(Buffer.from(`proxy:${proxyId}`, "utf8"));
  const ciphertext = Buffer.concat([legacy.update(plain, "utf8"), legacy.final()]);
  return { ciphertext, iv, tag: legacy.getAuthTag(), version: 1 };
}

describe("KeyCipher", () => {
  it("encrypt gives version 2, and decrypt gives back the text", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", keyId);
    expect(sealed.version).toBe(2);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(cipher.decrypt(sealed, keyId)).toBe("sk-live-abc3f9a");
  });

  it("two encrypts of one key give two different IVs and ciphertexts", () => {
    const one = cipher.encrypt("sk-live-abc3f9a", keyId);
    const two = cipher.encrypt("sk-live-abc3f9a", keyId);
    expect(one.iv.equals(two.iv)).toBe(false);
    expect(one.ciphertext.equals(two.ciphertext)).toBe(false);
  });

  it("version 2 does not decrypt with another key id", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", keyId);
    expect(() => cipher.decrypt(sealed, "5a1e9d4c-2b3f-4c6d-9e8f-7a6b5c4d3e21")).toThrow(KeyDecryptError);
  });

  it("version 1 decrypts with the proxy AAD of the same id", () => {
    expect(cipher.decrypt(sealVersion1("sk-old-77aa", keyId), keyId)).toBe("sk-old-77aa");
  });

  it("version 2 does not decrypt a key that the proxy AAD sealed", () => {
    expect(() => cipher.decrypt({ ...sealVersion1("sk-old-77aa", keyId), version: 2 }, keyId)).toThrow(
      KeyDecryptError,
    );
  });

  it("a changed tag and an unknown version throw KeyDecryptError", () => {
    const sealed = cipher.encrypt("sk-live-abc3f9a", keyId);
    const tag = Buffer.from(sealed.tag);
    tag[0] = (tag[0] ?? 0) ^ 1;
    expect(() => cipher.decrypt({ ...sealed, tag }, keyId)).toThrow(KeyDecryptError);
    expect(() => cipher.decrypt({ ...sealed, version: 3 }, keyId)).toThrow(KeyDecryptError);
  });

  it("loadEnv refuses a KEY_ENCRYPTION_KEY of 31 bytes and a missing one", () => {
    expect(() => testEnv({ KEY_ENCRYPTION_KEY: randomBytes(31).toString("base64") })).toThrow(/KEY_ENCRYPTION_KEY/);
    expect(() => testEnv({ KEY_ENCRYPTION_KEY: "" })).toThrow(/KEY_ENCRYPTION_KEY/);
    expect(testEnv().KEY_ENCRYPTION_KEY).toHaveLength(32);
  });
});
