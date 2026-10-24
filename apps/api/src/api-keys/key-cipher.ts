import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
/** Version 1 keys came from the proxy rows and use the AAD "proxy:<id>". Each new key is version 2. */
const KEY_VERSION = 2;
const AAD_PREFIX: Record<number, string> = { 1: "proxy", 2: "api_key" };

/** The Nest injection token for the KeyCipher. */
export const KEY_CIPHER = Symbol("KEY_CIPHER");

export interface SealedKey {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
  version: number;
}

/** A sealed key does not open: a wrong tag, a wrong key ID, or an unknown key version. */
export class KeyDecryptError extends Error {
  constructor() {
    super("The API key does not decrypt");
    this.name = "KeyDecryptError";
  }
}

/**
 * Encrypts the saved API keys with AES-256-GCM. Each key gets a new IV.
 * The key ID is in the AAD, so a ciphertext that moves to another key row does not decrypt.
 */
export class KeyCipher {
  constructor(private readonly masterKey: Buffer) {}

  encrypt(plain: string, apiKeyId: string): SealedKey & { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    cipher.setAAD(aad(KEY_VERSION, apiKeyId));
    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag(), version: KEY_VERSION };
  }

  decrypt(sealed: SealedKey, apiKeyId: string): string {
    if (!Object.hasOwn(AAD_PREFIX, sealed.version)) {
      throw new KeyDecryptError();
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.masterKey, sealed.iv);
      decipher.setAAD(aad(sealed.version, apiKeyId));
      decipher.setAuthTag(sealed.tag);
      return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new KeyDecryptError();
    }
  }
}

function aad(version: number, apiKeyId: string): Buffer {
  return Buffer.from(`${AAD_PREFIX[version]}:${apiKeyId}`, "utf8");
}
