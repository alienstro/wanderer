import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip.js";

function fakeRequest(headers: Record<string, string>, ip = "172.18.0.5"): Request {
  return { headers, ip } as unknown as Request;
}

describe("clientIp", () => {
  it("returns CF-Connecting-IP when Cloudflare sets it", () => {
    expect(clientIp(fakeRequest({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("gives two clients behind the same tunnel container two different keys", () => {
    const a = clientIp(fakeRequest({ "cf-connecting-ip": "203.0.113.7" }));
    const b = clientIp(fakeRequest({ "cf-connecting-ip": "198.51.100.9" }));
    expect(a).not.toBe(b);
  });

  it("ignores a CF-Connecting-IP value that is not an IP address", () => {
    expect(clientIp(fakeRequest({ "cf-connecting-ip": "not-an-ip" }))).toBe("172.18.0.5");
  });

  it("returns req.ip when no CF-Connecting-IP header exists", () => {
    expect(clientIp(fakeRequest({}))).toBe("172.18.0.5");
  });

  it("gives all addresses in one IPv6 /64 block the same key", () => {
    const a = clientIp(fakeRequest({ "cf-connecting-ip": "2001:db8:1:2:aaaa::1" }));
    const b = clientIp(fakeRequest({ "cf-connecting-ip": "2001:db8:1:2:bbbb::9" }));
    expect(a).toBe("2001:db8:1:2::/64");
    expect(b).toBe(a);
  });

  it("changes an IPv4-mapped IPv6 address to IPv4", () => {
    expect(clientIp(fakeRequest({}, "::ffff:203.0.113.7"))).toBe("203.0.113.7");
  });
});
