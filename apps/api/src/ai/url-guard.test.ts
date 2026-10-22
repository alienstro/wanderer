import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { assertProxyUrl, BlockedUrlError, createGuardedLookup, isBlockedAddress } from "./url-guard.js";

/** Calls the guarded lookup as the undici connector does, with `all: true`. */
function lookup(resolved: Array<{ address: string; family: 4 | 6 }>): Promise<LookupAddress[]> {
  const guarded = createGuardedLookup(() => Promise.resolve(resolved));
  return new Promise((resolve, reject) => {
    guarded("api.example.com", { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
      } else {
        resolve(addresses as LookupAddress[]);
      }
    });
  });
}

describe("isBlockedAddress", () => {
  it("is true for loopback, private, CGNAT, link-local, metadata, and IPv4-mapped private addresses", () => {
    const blocked = [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:10.0.0.5",
    ];
    for (const ip of blocked) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("is false for 8.8.8.8 and 2606:4700::1111", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("2606:4700::1111")).toBe(false);
  });
});

describe("assertProxyUrl", () => {
  it("refuses http, localhost, a.localhost, https://127.0.0.1, and https://[::1]", () => {
    const bad = [
      "http://api.example.com/v1",
      "https://localhost/v1",
      "https://a.localhost/v1",
      "https://127.0.0.1/v1",
      "https://[::1]/v1",
      "https://[::ffff:10.0.0.5]/v1",
    ];
    for (const url of bad) {
      expect(() => assertProxyUrl(url), url).toThrow(BlockedUrlError);
    }
    expect(() => assertProxyUrl("https://api.example.com/v1")).not.toThrow();
  });
});

describe("createGuardedLookup", () => {
  it("calls back with the address when the host resolves to 8.8.8.8", async () => {
    await expect(lookup([{ address: "8.8.8.8", family: 4 }])).resolves.toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("calls back with BlockedUrlError when one of two addresses is 192.168.1.1", async () => {
    await expect(
      lookup([
        { address: "8.8.8.8", family: 4 },
        { address: "192.168.1.1", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });
});
