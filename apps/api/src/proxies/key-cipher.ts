import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_VERSION = 1;

/** The Nest injection token for the KeyCipher. */
export const KEY_CIPHER = Symbol("KEY_CIPHER");

export interface SealedKey {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  version: number;
}

/** A sealed key does not open: a wrong tag, a wrong proxy ID, or an unknown key version. */
export class KeyDecryptError extends Error {
  constructor() {
    super("The API key does not decrypt");
    this.name = "KeyDecryptError";
  }
}

/**
 * Encrypts the API keys of proxies with AES-256-GCM. Each key gets a new IV.
 * The proxy ID is the AAD, so a ciphertext that moves to another proxy row does not decrypt.
 */
export class KeyCipher {
  constructor(private readonly masterKey: Buffer) {}

  encrypt(plain: string, proxyId: string): SealedKey {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    cipher.setAAD(aad(proxyId));
    const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag(), version: KEY_VERSION };
  }

  decrypt(sealed: SealedKey, proxyId: string): string {
    if (sealed.version !== KEY_VERSION) {
      throw new KeyDecryptError();
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.masterKey, sealed.iv);
      decipher.setAAD(aad(proxyId));
      decipher.setAuthTag(sealed.tag);
      return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new KeyDecryptError();
    }
  }
}

function aad(proxyId: string): Buffer {
  return Buffer.from(`proxy:${proxyId}`, "utf8");
}
