import { isIP } from "node:net";
import type { Request } from "express";
import ipaddr from "ipaddr.js";

/**
 * Returns the rate-limit key of the client.
 * Cloudflare sets CF-Connecting-IP on each request through the tunnel. Traefik replaces
 * X-Forwarded-For with the address of the cloudflared container, so req.ip is the same
 * for all users. Only the tunnel can reach Traefik, so a client cannot set this header itself.
 */
export function clientIp(req: Request): string {
  const header = req.headers["cf-connecting-ip"];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  if (value && isIP(value) !== 0) {
    return rateLimitKey(value);
  }
  return req.ip && isIP(req.ip) !== 0 ? rateLimitKey(req.ip) : "unknown";
}

/**
 * One IPv6 user gets a full /64 block, so the key is the /64 prefix.
 * An IPv4-mapped IPv6 address becomes the IPv4 address.
 */
function rateLimitKey(ip: string): string {
  const address = ipaddr.process(ip);
  if (address.kind() === "ipv4") {
    return address.toString();
  }
  const prefix = ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/64`);
  return `${prefix.toString().replace(/::$/, "")}::/64`;
}
